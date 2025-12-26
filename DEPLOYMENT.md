# proPACE Production Deployment Guide

Complete guide for deploying proPACE in production environments.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create configuration file
cp config/propace.example.json config/propace.json

# 3. Edit configuration
nano config/propace.json

# 4. Build the project
npm run build

# 5. Run in production
npm run start:production
```

## Configuration

### Configuration File Locations

proPACE searches for configuration in this order:
1. Path specified as command line argument: `npm run start:production /path/to/config.json`
2. `PROPACE_CONFIG` environment variable
3. `./config/propace.json`
4. `./propace.config.json`
5. `/etc/propace/config.json`
6. Falls back to default configuration

### Configuration Structure

```json
{
  "version": "1.0.0",
  "environment": "production",

  "storage": {
    "dataPath": "./data/propace.db",
    "eventPath": "./data/events.db"
  },

  "decisionEngine": {
    "defaultAutonomyLevel": "monitored",
    "maxRiskLevel": "medium",
    "approvalTimeoutMs": 300000
  },

  "plugins": {
    "temperature-sensor": {
      "enabled": false,
      "pollInterval": 30000,
      "settings": {}
    }
  },

  "rules": [],

  "monitoring": {
    "healthCheckIntervalMs": 30000,
    "errorThreshold": 100
  },

  "api": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:3001"]
    },
    "rateLimit": {
      "enabled": true,
      "windowMs": 60000,
      "maxRequests": 100
    }
  },

  "logging": {
    "level": "info",
    "file": {
      "enabled": true,
      "path": "./logs/propace.log",
      "maxSize": "10m",
      "maxFiles": 5
    },
    "console": {
      "enabled": true,
      "colorize": false
    }
  },

  "auth": {
    "enabled": true,
    "type": "api-key",
    "apiKeys": ["your-secure-api-key-here"]
  },

  "dataRetention": {
    "enabled": true,
    "sensorDataDays": 90,
    "eventLogDays": 30,
    "decisionHistoryDays": 365
  }
}
```

### Environment-Specific Configurations

Create separate config files for each environment:

```bash
config/
  propace.development.json
  propace.production.json
  propace.test.json
```

Load the appropriate config:

```bash
# Development
NODE_ENV=development npm run start:production config/propace.development.json

# Production
NODE_ENV=production npm run start:production config/propace.production.json
```

## Storage Setup

### Directory Structure

```
/path/to/propace/
├── config/
│   └── propace.json
├── data/
│   ├── propace.db       # Sensor data storage
│   └── events.db        # Event log storage
├── logs/
│   ├── propace-YYYY-MM-DD.log
│   └── propace-error-YYYY-MM-DD.log
└── dist/
    └── main.js          # Compiled entry point
```

### Create Required Directories

```bash
mkdir -p config data logs
```

### Database Location

For production:
- Use file-based SQLite databases (not `:memory:`)
- Store in a directory with sufficient disk space
- Ensure the directory has appropriate permissions
- Consider mounting a separate volume for data persistence

Example:
```json
{
  "storage": {
    "dataPath": "/var/lib/propace/data/propace.db",
    "eventPath": "/var/lib/propace/data/events.db"
  }
}
```

## API Server

### Endpoints

#### Public Endpoints
- `GET /api/health` - System health check (no auth required)
- `GET /` - API information

#### Protected Endpoints (require authentication)
- `GET /api/state` - Current system state
- `GET /api/metrics` - System metrics
- `GET /api/components` - Component health
- `GET /api/errors` - Recent errors
- `GET /api/sensors` - Sensor data (placeholder)
- `GET /api/decisions` - Decision history (placeholder)
- `POST /api/decisions/:id/approve` - Approve decision (placeholder)
- `GET /api/plugins` - Plugin status (placeholder)

### WebSocket Connection

Connect to WebSocket at `ws://host:port/ws`

#### Authentication

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    apiKey: 'your-api-key-here'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});
```

#### Subscribe to Events

```javascript
// Subscribe to specific event types
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['sensor_trigger', 'sensor_anomaly']
}));

// Subscribe to all events
ws.send(JSON.stringify({
  type: 'subscribe',
  events: '*'
}));
```

#### Request Health Status

```javascript
ws.send(JSON.stringify({
  type: 'get_health'
}));
```

### CORS Configuration

For web UIs hosted on different domains:

```json
{
  "api": {
    "cors": {
      "enabled": true,
      "origins": [
        "http://localhost:3001",
        "https://your-ui-domain.com",
        "https://app.yourdomain.com"
      ]
    }
  }
}
```

### Rate Limiting

Protect your API from abuse:

```json
{
  "api": {
    "rateLimit": {
      "enabled": true,
      "windowMs": 60000,      // 1 minute
      "maxRequests": 100      // 100 requests per minute
    }
  }
}
```

## Authentication

### API Key Authentication

1. Generate secure API keys:
```bash
openssl rand -hex 32
```

2. Add to configuration:
```json
{
  "auth": {
    "enabled": true,
    "type": "api-key",
    "apiKeys": [
      "your-secure-api-key-here"
    ]
  }
}
```

3. Use in requests:
```bash
curl -H "Authorization: Bearer your-secure-api-key-here" \
  http://localhost:3000/api/state
```

### Disabling Authentication (Development Only)

```json
{
  "auth": {
    "enabled": false
  }
}
```

## Logging

### File Logging

Logs are rotated daily and automatically cleaned up:

```json
{
  "logging": {
    "level": "info",
    "file": {
      "enabled": true,
      "path": "./logs/propace.log",
      "maxSize": "10m",       // Max file size before rotation
      "maxFiles": 5           // Keep 5 most recent log files
    }
  }
}
```

### Log Levels

- `debug` - Detailed debugging information
- `info` - General informational messages (recommended for production)
- `warn` - Warning messages
- `error` - Error messages only

### Log Files

- `propace-YYYY-MM-DD.log` - All logs
- `propace-error-YYYY-MM-DD.log` - Error logs only

### Viewing Logs

```bash
# Follow logs in real-time
tail -f logs/propace-$(date +%Y-%m-%d).log

# Search for errors
grep ERROR logs/propace-*.log

# View last 100 lines
tail -n 100 logs/propace-$(date +%Y-%m-%d).log
```

## Data Retention

Automatic cleanup of old data to prevent database bloat:

```json
{
  "dataRetention": {
    "enabled": true,
    "sensorDataDays": 90,        // Delete sensor data older than 90 days
    "eventLogDays": 30,          // Delete events older than 30 days
    "decisionHistoryDays": 365   // Delete decisions older than 1 year
  }
}
```

Cleanup runs automatically every 24 hours.

## Running as a Service

### systemd (Linux)

Create `/etc/systemd/system/propace.service`:

```ini
[Unit]
Description=proPACE Autonomous Assistant
After=network.target

[Service]
Type=simple
User=propace
WorkingDirectory=/opt/propace
ExecStart=/usr/bin/node /opt/propace/dist/main.js /opt/propace/config/propace.json
Restart=always
RestartSec=10
StandardOutput=append:/var/log/propace/stdout.log
StandardError=append:/var/log/propace/stderr.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable propace
sudo systemctl start propace
sudo systemctl status propace
```

View logs:
```bash
sudo journalctl -u propace -f
```

### Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Create data directories
RUN mkdir -p /app/data /app/logs /app/config

# Expose API port
EXPOSE 3000

# Run as non-root user
USER node

# Start application
CMD ["node", "dist/main.js", "/app/config/propace.json"]
```

Build and run:
```bash
docker build -t propace:latest .

docker run -d \
  --name propace \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  propace:latest
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  propace:
    build: .
    container_name: propace
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

Run:
```bash
docker-compose up -d
docker-compose logs -f propace
```

## Monitoring

### Health Checks

```bash
# Check if system is healthy
curl http://localhost:3000/api/health

# Example response:
{
  "status": "healthy",
  "state": "running",
  "uptime": 3600000,
  "components": {
    "eventBus": { "healthy": true, "state": "running" },
    "dataPipeline": { "healthy": true, "state": "running" },
    "pluginManager": { "healthy": true, "state": "running" },
    "decisionEngine": { "healthy": true, "state": "running" }
  },
  "metrics": {
    "eventsProcessedPerSecond": 2.5,
    "dataPointsIngestedPerSecond": 1.0,
    "decisionsPerMinute": 0.5,
    "averageLatencyMs": 0,
    "uptime": 3600000
  },
  "timestamp": "2025-12-22T10:30:00.000Z"
}
```

### External Monitoring

Use the `/api/health` endpoint for:
- Load balancer health checks
- Kubernetes liveness/readiness probes
- Uptime monitoring services (UptimeRobot, Pingdom, etc.)

### Prometheus Metrics (Future)

Future enhancement will expose metrics in Prometheus format at `/metrics`.

## Security Considerations

### API Security
- Always use HTTPS in production
- Keep API keys secure and rotate regularly
- Use environment variables for sensitive data
- Enable rate limiting to prevent abuse

### Database Security
- Restrict file system permissions on database files
- Regular backups of data and event databases
- Consider encrypting sensitive data

### Network Security
- Run behind a reverse proxy (nginx, Caddy)
- Use firewall rules to restrict access
- Only expose necessary ports

### Example nginx Configuration

```nginx
server {
    listen 80;
    server_name propace.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name propace.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## Backup and Recovery

### Database Backup

```bash
# Backup databases
cp data/propace.db data/propace.db.backup
cp data/events.db data/events.db.backup

# Automated daily backups
0 2 * * * cp /path/to/propace/data/*.db /path/to/backups/$(date +\%Y\%m\%d)/
```

### Configuration Backup

```bash
# Backup configuration
cp config/propace.json config/propace.json.backup
```

### Recovery

```bash
# Stop service
sudo systemctl stop propace

# Restore databases
cp data/propace.db.backup data/propace.db
cp data/events.db.backup data/events.db

# Start service
sudo systemctl start propace
```

## Troubleshooting

### Service Won't Start

1. Check logs:
```bash
tail -n 100 logs/propace-*.log
```

2. Verify configuration:
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('config/propace.json')))"
```

3. Check permissions:
```bash
ls -la data/ logs/ config/
```

### High Memory Usage

- Check database sizes: `du -h data/`
- Review data retention settings
- Consider reducing health check interval

### API Not Accessible

- Verify API is enabled in configuration
- Check firewall rules: `sudo ufw status`
- Test locally: `curl http://localhost:3000/api/health`
- Check if port is in use: `lsof -i :3000`

### WebSocket Connection Fails

- Verify WebSocket path: `/ws`
- Check for proxy configuration issues
- Test with wscat: `wscat -c ws://localhost:3000/ws`

## Performance Tuning

### Database Optimization

```bash
# Vacuum databases periodically (done automatically by data retention)
sqlite3 data/propace.db "VACUUM;"
sqlite3 data/events.db "VACUUM;"
```

### Node.js Performance

```bash
# Increase memory limit if needed
node --max-old-space-size=4096 dist/main.js

# Enable production optimizations
NODE_ENV=production node dist/main.js
```

## Next Steps

After deployment:

1. **Monitor health**: Check `/api/health` regularly
2. **Review logs**: Watch for errors and warnings
3. **Test WebSocket**: Connect a test client
4. **Implement UI**: Build a web interface using the API
5. **Add sensors**: When hardware arrives, enable sensor plugins
6. **Create rules**: Define decision rules for automation

## Support

For issues and questions:
- Check logs first
- Review this deployment guide
- Check the main README.md
- Open an issue on GitHub
