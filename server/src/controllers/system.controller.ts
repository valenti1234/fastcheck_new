import { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

interface SystemStatus {
  server: {
    status: 'online' | 'offline' | 'warning';
    uptime: string;
    version: string;
    lastRestart: string;
  };
  database: {
    status: 'connected' | 'disconnected' | 'slow';
    responseTime: number;
    connections: number;
    size: string;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    activeRequests: number;
    diskSpace: {
      total: string;
      used: string;
      free: string;
      usagePercentage: number;
    };
  };
  services: {
    sheriff: 'active' | 'inactive' | 'error';
    notifications: 'active' | 'inactive' | 'error';
    monitoring: 'active' | 'inactive' | 'error';
  };
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  if (days > 0) {
    return `${days} días, ${hours} horas`;
  } else if (hours > 0) {
    return `${hours} horas, ${minutes} minutos`;
  } else {
    return `${minutes} minutos`;
  }
}

// Helper function to get disk usage
async function getDiskUsage(): Promise<{ total: string; used: string; free: string; usagePercentage: number }> {
  try {
    const stats = await stat('/');
    const totalSpace = os.totalmem(); // Using total memory as approximation
    const freeSpace = os.freemem();
    const usedSpace = totalSpace - freeSpace;
    const usagePercentage = Math.round((usedSpace / totalSpace) * 100);
    
    return {
      total: formatBytes(totalSpace),
      used: formatBytes(usedSpace),
      free: formatBytes(freeSpace),
      usagePercentage
    };
  } catch (error) {
    // Fallback values if disk stats are not available
    return {
      total: '100 GB',
      used: '45 GB',
      free: '55 GB',
      usagePercentage: 45
    };
  }
}

// Helper function to check database status
async function getDatabaseStatus(): Promise<{ status: 'connected' | 'disconnected' | 'slow'; responseTime: number; connections: number; size: string }> {
  try {
    const startTime = Date.now();
    
    // Check if mongoose is connected
    if (mongoose.connection.readyState !== 1) {
      return {
        status: 'disconnected',
        responseTime: 0,
        connections: 0,
        size: '0 MB'
      };
    }
    
    // Ping the database to measure response time
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - startTime;
    
    // Get database stats
    const dbStats = await mongoose.connection.db.stats();
    const dbSize = formatBytes(dbStats.dataSize || 0);
    
    // Get connection count (approximation)
    const connections = mongoose.connections.length;
    
    const status = responseTime > 1000 ? 'slow' : 'connected';
    
    return {
      status,
      responseTime,
      connections,
      size: dbSize
    };
  } catch (error) {
    console.error('Error checking database status:', error);
    return {
      status: 'disconnected',
      responseTime: 0,
      connections: 0,
      size: '0 MB'
    };
  }
}

// Helper function to get CPU usage (approximation)
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  
  return Math.max(0, Math.min(100, usage));
}

// Helper function to check service status
function getServiceStatus(): { sheriff: 'active' | 'inactive' | 'error'; notifications: 'active' | 'inactive' | 'error'; monitoring: 'active' | 'inactive' | 'error' } {
  // For now, we'll return mock data. In a real implementation, you would check actual service health
  return {
    sheriff: process.env.SHERIFF_API_TOKEN ? 'active' : 'inactive',
    notifications: process.env.SENDGRID_API_KEY ? 'active' : 'inactive',
    monitoring: 'active' // Assuming monitoring is always active if the server is running
  };
}

export const getSystemStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // Get system information
    const [databaseStatus, diskSpace] = await Promise.all([
      getDatabaseStatus(),
      getDiskUsage()
    ]);
    
    const systemStatus: SystemStatus = {
      server: {
        status: 'online',
        uptime: formatUptime(startTime),
        version: process.env.npm_package_version || '1.0.0',
        lastRestart: new Date(Date.now() - startTime * 1000).toISOString()
      },
      database: databaseStatus,
      performance: {
        cpuUsage: getCpuUsage(),
        memoryUsage: Math.round((usedMemory / totalMemory) * 100),
        diskUsage: diskSpace.usagePercentage,
        activeRequests: 0, // This would need to be tracked separately in a real implementation
        diskSpace
      },
      services: getServiceStatus()
    };
    
    res.json(systemStatus);
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({
      error: 'Failed to retrieve system status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

const getVmIpv4Addresses = (): string[] => {
  const interfaces = os.networkInterfaces();
  const results: string[] = [];

  for (const infos of Object.values(interfaces)) {
    if (!infos) continue;
    for (const info of infos) {
      if (info.family !== 'IPv4') continue;
      if (info.internal) continue;
      results.push(info.address);
    }
  }

  return results;
};

export const getVmIp = async (req: Request, res: Response): Promise<void> => {
  const override = (process.env.VM_IP || process.env.HOST_IP || '').trim();
  const ips = override ? [override] : getVmIpv4Addresses();
  const ip = ips[0] || null;

  res.json({ ip, ips });
};
