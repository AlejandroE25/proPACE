/**
 * Temperature Sensor Plugin
 *
 * Monitors temperature sensors, detects anomalies (spikes, drops, out-of-range),
 * and publishes events to the EventBus.
 */

import { BasePlugin } from '../basePlugin';
import { PluginMetadata, PluginCapability, PluginConfig } from '../types';
import { SensorType, SensorReading } from '../../data/types';
import { EventType, EventPriority } from '../../events/types';

/**
 * Temperature sensor configuration
 */
export interface TemperatureSensorConfig {
  sensorId: string;
  normalRange: {
    min: number;  // Minimum normal temperature (°C)
    max: number;  // Maximum normal temperature (°C)
  };
  anomalyThreshold: number;  // Degrees change for anomaly detection
  location?: string;  // Optional location label
}

/**
 * Temperature sensor plugin
 */
export class TemperatureSensorPlugin extends BasePlugin {
  private sensorConfig: TemperatureSensorConfig;
  private stats: {
    totalReadings: number;
    anomaliesDetected: number;
    lastReading?: Date;
  };

  constructor(config: TemperatureSensorConfig) {
    const metadata: PluginMetadata = {
      id: 'temperature-sensor',
      name: 'Temperature Sensor Monitor',
      version: '1.0.0',
      description: 'Monitors temperature sensors and detects anomalies',
      author: 'proPACE',
      capability: PluginCapability.MONITORING
    };

    super(metadata);

    this.sensorConfig = config;
    this.stats = {
      totalReadings: 0,
      anomaliesDetected: 0
    };
  }

  /**
   * Called when plugin starts
   */
  protected async onStart(): Promise<void> {
    // Initialization logic (e.g., connect to physical sensor)
    // For now, this is a simulated sensor
  }

  /**
   * Called when plugin stops
   */
  protected async onStop(): Promise<void> {
    // Cleanup logic (e.g., disconnect from physical sensor)
  }

  /**
   * Poll for temperature reading
   */
  async poll(): Promise<void> {
    try {
      // Get current temperature
      const temperature = await this.getCurrentTemperature();

      // Create sensor reading
      const reading: SensorReading = {
        sensorId: this.sensorConfig.sensorId,
        sensorType: SensorType.TEMPERATURE,
        value: temperature,
        unit: '°C',
        timestamp: new Date(),
        metadata: {
          location: this.sensorConfig.location
        }
      };

      // Ingest data via pipeline
      await this.ingestData(reading);

      // Update statistics
      this.stats.totalReadings++;
      this.stats.lastReading = new Date();

      // Check for anomalies
      await this.checkForAnomalies(temperature);

    } catch (err) {
      this.recordError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Get current temperature reading
   * In production, this would read from actual hardware sensor
   */
  private async getCurrentTemperature(): Promise<number> {
    // Simulated temperature reading
    // In production, this would interface with actual sensor hardware:
    // - I2C/SPI sensor (DHT22, DS18B20, etc.)
    // - HTTP API (smart thermostat)
    // - MQTT topic (IoT sensor)

    // For now, generate realistic temperature around 22°C with slight variation
    const baseTemp = 22;
    const variation = (Math.random() - 0.5) * 2; // ±1°C variation
    return baseTemp + variation;
  }

  /**
   * Check for temperature anomalies
   */
  private async checkForAnomalies(currentTemp: number): Promise<void> {
    // Check 1: Out of normal range
    if (currentTemp < this.sensorConfig.normalRange.min ||
        currentTemp > this.sensorConfig.normalRange.max) {
      await this.publishAnomalyEvent(currentTemp, 'out_of_range');
      return;
    }

    // Check 2: Sudden spike/drop compared to recent reading
    const recentReadings = await this.dataPipeline.getRecentReadings(
      this.sensorConfig.sensorId,
      1
    );

    if (recentReadings.length > 0) {
      const lastReading = recentReadings[0];
      const tempChange = Math.abs(currentTemp - lastReading.value);

      if (tempChange >= this.sensorConfig.anomalyThreshold) {
        const anomalyType = currentTemp > lastReading.value ? 'spike' : 'drop';
        await this.publishAnomalyEvent(currentTemp, anomalyType);
      }
    }
  }

  /**
   * Publish anomaly event to EventBus
   */
  private async publishAnomalyEvent(
    temperature: number,
    anomalyType: 'spike' | 'drop' | 'out_of_range'
  ): Promise<void> {
    this.stats.anomaliesDetected++;

    await this.publishEvent({
      type: EventType.SENSOR_ANOMALY,
      priority: EventPriority.HIGH,
      source: `sensor:${this.sensorConfig.sensorId}`,
      payload: {
        sensorId: this.sensorConfig.sensorId,
        sensorType: SensorType.TEMPERATURE,
        value: temperature,
        unit: '°C',
        anomalyType,
        normalRange: this.sensorConfig.normalRange,
        location: this.sensorConfig.location,
        timestamp: new Date()
      }
    });
  }

  /**
   * Update plugin configuration
   */
  async updateConfig(config: Partial<PluginConfig>): Promise<void> {
    // Update sensor-specific settings
    if (config.settings) {
      if (config.settings.normalRange) {
        this.sensorConfig.normalRange = config.settings.normalRange;
      }
      if (config.settings.anomalyThreshold) {
        this.sensorConfig.anomalyThreshold = config.settings.anomalyThreshold;
      }
      if (config.settings.location) {
        this.sensorConfig.location = config.settings.location;
      }
    }

    // Call parent updateConfig for poll interval changes
    await super.updateConfig(config);
  }

  /**
   * Get plugin statistics
   */
  // @ts-ignore - Reserved for future statistics API
  private getStatistics() {
    return {
      totalReadings: this.stats.totalReadings,
      anomaliesDetected: this.stats.anomaliesDetected,
      lastReading: this.stats.lastReading
    };
  }
}
