// Elasticsearch index mappings for different log types

export interface ElasticsearchMapping {
  mappings: {
    properties: Record<string, any>;
  };
  settings?: {
    number_of_shards?: number;
    number_of_replicas?: number;
    index?: Record<string, any>;
  };
}

// Common properties shared across all log types
const commonProperties = {
  '@timestamp': {
    type: 'date',
    format: 'strict_date_optional_time||epoch_millis'
  },
  level: {
    type: 'keyword'
  },
  message: {
    type: 'text',
    analyzer: 'standard'
  },
  service: {
    type: 'keyword'
  },
  environment: {
    type: 'keyword'
  },
  logType: {
    type: 'keyword'
  },
  userId: {
    type: 'keyword'
  },
  tenantId: {
    type: 'keyword'
  },
  requestId: {
    type: 'keyword'
  }
};

// Sheriff API specific properties
const sheriffApiProperties = {
  ...commonProperties,
  callName: {
    type: 'keyword'
  },
  method: {
    type: 'keyword'
  },
  url: {
    type: 'text',
    fields: {
      keyword: {
        type: 'keyword',
        ignore_above: 256
      }
    }
  },
  statusCode: {
    type: 'integer'
  },
  responseTime: {
    type: 'integer'
  },
  rut: {
    type: 'keyword'
  },
  logId: {
    type: 'keyword'
  },
  success: {
    type: 'boolean'
  },
  errorMessage: {
    type: 'text'
  },
  requestPayload: {
    type: 'object',
    enabled: false
  },
  responseData: {
    type: 'object',
    enabled: false
  }
};

// HTTP Request logs mapping
export const httpRequestMapping: ElasticsearchMapping = {
  mappings: {
    properties: {
      ...commonProperties,
      type: {
        type: 'keyword'
      },
      method: {
        type: 'keyword'
      },
      url: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256
          }
        }
      },
      statusCode: {
        type: 'integer'
      },
      duration: {
        type: 'integer'
      },
      ip: {
        type: 'ip'
      },
      userAgent: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 512
          }
        }
      }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    index: {
      refresh_interval: '5s'
    }
  }
};

// Sheriff API calls mapping
export const sheriffApiMapping: ElasticsearchMapping = {
  mappings: {
    properties: sheriffApiProperties
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    index: {
      refresh_interval: '5s'
    }
  }
};

// Business Event logs mapping
export const businessEventMapping: ElasticsearchMapping = {
  mappings: {
    properties: {
      ...commonProperties,
      type: {
        type: 'keyword'
      },
      event: {
        type: 'keyword'
      },
      data: {
        type: 'object',
        dynamic: true
      },
      // Additional fields for business events
      entityType: {
        type: 'keyword'
      },
      entityId: {
        type: 'keyword'
      },
      action: {
        type: 'keyword'
      },
      result: {
        type: 'keyword'
      },
      metadata: {
        type: 'object',
        dynamic: true
      }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    index: {
      refresh_interval: '10s'
    }
  }
};

// System Error logs mapping
export const systemErrorMapping: ElasticsearchMapping = {
  mappings: {
    properties: {
      ...commonProperties,
      type: {
        type: 'keyword'
      },
      error: {
        properties: {
          name: {
            type: 'keyword'
          },
          message: {
            type: 'text',
            analyzer: 'standard'
          },
          stack: {
            type: 'text',
            index: false
          }
        }
      },
      context: {
        type: 'keyword'
      },
      // Additional error-specific fields
      severity: {
        type: 'keyword'
      },
      component: {
        type: 'keyword'
      },
      operation: {
        type: 'keyword'
      },
      errorCode: {
        type: 'keyword'
      }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    index: {
      refresh_interval: '5s'
    }
  }
};

// General logs mapping
export const generalMapping: ElasticsearchMapping = {
  mappings: {
    properties: {
      ...commonProperties,
      // Dynamic mapping for flexible general logs
      metadata: {
        type: 'object',
        dynamic: true
      },
      tags: {
        type: 'keyword'
      },
      category: {
        type: 'keyword'
      }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    index: {
      refresh_interval: '30s'
    }
  }
};

// Export all mappings
export const indexMappings = {
  httpRequest: httpRequestMapping,
  businessEvent: businessEventMapping,
  systemError: systemErrorMapping,
  general: generalMapping,
  sheriffApi: sheriffApiMapping
};

// Index lifecycle policies
export const indexLifecyclePolicies = {
  httpRequest: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '50gb',
              max_age: '30d'
            }
          }
        },
        warm: {
          min_age: '30d',
          actions: {
            allocate: {
              number_of_replicas: 0
            }
          }
        },
        delete: {
          min_age: '90d'
        }
      }
    }
  },
  businessEvent: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '10gb',
              max_age: '7d'
            }
          }
        },
        warm: {
          min_age: '7d',
          actions: {
            allocate: {
              number_of_replicas: 0
            }
          }
        },
        delete: {
          min_age: '365d'
        }
      }
    }
  },
  systemError: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '5gb',
              max_age: '7d'
            }
          }
        },
        warm: {
          min_age: '7d',
          actions: {
            allocate: {
              number_of_replicas: 1
            }
          }
        },
        delete: {
          min_age: '180d'
        }
      }
    }
  },
  general: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '20gb',
              max_age: '30d'
            }
          }
        },
        warm: {
          min_age: '30d',
          actions: {
            allocate: {
              number_of_replicas: 0
            }
          }
        },
        delete: {
          min_age: '60d'
        }
      }
    }
  }
};