import amqp from 'amqplib';
import dotenv from 'dotenv';

dotenv.config();

export class RabbitMQService {
  private static instance: RabbitMQService;
  private connection: any | null = null;
  private channel: any | null = null;
  private readonly queueName: string;
  private readonly url: string;
  private readonly enabled: boolean;
  private readonly username: string;
  private readonly password: string;
  private readonly host: string;
  private readonly port: number;
  private readonly vhost: string;
  private readonly protocol: string;

  private constructor() {
    this.queueName = process.env.RABBITMQ_QUEUE || 'evaluation_queue';
    this.enabled = (process.env.RABBITMQ_ENABLED || 'true') === 'true';

    const explicitUrl = process.env.RABBITMQ_URL; // use as-is if provided

    this.username = process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER || 'guest';
    this.password = process.env.RABBITMQ_PASSWORD || 'guest';
    this.host = process.env.RABBITMQ_HOST || 'localhost';
    this.port = Number(process.env.RABBITMQ_PORT || 5672);
    this.vhost = process.env.RABBITMQ_VHOST || '/';
    this.protocol = process.env.RABBITMQ_PROTOCOL || 'amqp';

    this.url = explicitUrl || `${this.protocol}://${encodeURIComponent(this.username)}:${encodeURIComponent(this.password)}@${this.host}:${this.port}/${encodeURIComponent(this.vhost)}`;
  }

  static getInstance(): RabbitMQService {
    if (!RabbitMQService.instance) {
      RabbitMQService.instance = new RabbitMQService();
    }
    return RabbitMQService.instance;
  }

  async initialize() {
    try {
      if (!this.enabled) {
        console.warn(`[${new Date().toISOString()}] [RabbitMQ] - Disabled via RABBITMQ_ENABLED env, skipping initialization.`);
        return;
      }
      const safeTarget = `${this.host}:${this.port}/${this.vhost}`;
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Connecting to RabbitMQ at ${safeTarget}`);
      this.connection = await amqp.connect(this.url);
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Connection established, creating channel...`);
      
      if (!this.connection) {
        throw new Error('Failed to establish connection');
      }
      
      this.channel = await this.connection.createChannel();
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Channel created successfully`);
      
      if (!this.channel) {
        throw new Error('Failed to create channel');
      }
      
      await this.channel.assertQueue(this.queueName, { durable: true });
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Queue ${this.queueName} asserted with durable=true`);

      // Handle connection errors
      this.connection.on('error', (err: any) => {
        console.error(`[${new Date().toISOString()}] [RabbitMQ] - Connection error: ${err.message}\nStack: ${err.stack}`);
      });

      this.connection.on('close', () => {
        console.error(`[${new Date().toISOString()}] [RabbitMQ] - Connection closed unexpectedly. Attempting to reconnect in 5 seconds...`);
        setTimeout(() => this.initialize(), 5000);
      });

      // Add channel error handling
      this.channel.on('error', (err: any) => {
        console.error(`[${new Date().toISOString()}] [RabbitMQ] - Channel error: ${err.message}\nStack: ${err.stack}`);
      });

      this.channel.on('close', () => {
        console.log(`[${new Date().toISOString()}] [RabbitMQ] - Channel closed`);
      });

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }

  async publishEvaluation(data: { rut: string; name?: string; jobId: string; tenantId: string; userId: string }) {
    if (!this.channel) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Cannot publish: Channel not initialized`);
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Publishing evaluation for RUT: ${data.rut}, JobID: ${data.jobId}, TenantID: ${data.tenantId}, UserID: ${data.userId}`);
      const message = Buffer.from(JSON.stringify(data));
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Message size: ${message.length} bytes`);
      
      this.channel.sendToQueue(
        this.queueName,
        message,
        { persistent: true }
      );
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Successfully published message to queue ${this.queueName}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Failed to publish message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }

  async startConsumer(processCallback: (data: any) => Promise<void>) {
    if (!this.channel) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Cannot start consumer: Channel not initialized`);
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      await this.channel.prefetch(1);
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Starting consumer on queue ${this.queueName} with prefetch=1`);
      
      await this.channel.consume(this.queueName, async (msg: any) => {
        if (msg) {
          const data = JSON.parse(msg.content.toString());
          console.log(`[${new Date().toISOString()}] [RabbitMQ] - Processing message: RUT=${data.rut}, JobID=${data.jobId}, TenantID=${data.tenantId}, UserID=${data.userId}`);
          console.log(`[${new Date().toISOString()}] [RabbitMQ] - Message properties: ${JSON.stringify(msg.properties)}`);
          
          try {
            // Add delay before processing the next message
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const startTime = Date.now();
            await processCallback(data);
            const processingTime = Date.now() - startTime;
            
            this.channel?.ack(msg);
            console.log(`[${new Date().toISOString()}] [RabbitMQ] - Successfully processed message for RUT=${data.rut} in ${processingTime}ms`);
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
            this.channel?.nack(msg, false, true);
            console.log(`[${new Date().toISOString()}] [RabbitMQ] - Message requeued for RUT=${data.rut}`);
          }
        }
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Failed to start consumer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }

  async close() {
    try {
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Initiating graceful shutdown...`);
      
      if (this.channel) {
        console.log(`[${new Date().toISOString()}] [RabbitMQ] - Closing channel...`);
        await this.channel.close();
        console.log(`[${new Date().toISOString()}] [RabbitMQ] - Channel closed successfully`);
      }
      
      if (this.connection) {
        console.log(`[${new Date().toISOString()}] [RabbitMQ] - Closing connection...`);
        await this.connection.close();
        console.log(`[${new Date().toISOString()}] [RabbitMQ] - Connection closed successfully`);
      }
      
      console.log(`[${new Date().toISOString()}] [RabbitMQ] - Shutdown completed successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Failed to close RabbitMQ connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[${new Date().toISOString()}] [RabbitMQ] - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }
}