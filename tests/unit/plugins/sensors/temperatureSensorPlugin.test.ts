/**
 * TemperatureSensorPlugin Test Suite
 *
 * Tests the temperature sensor plugin implementation including
 * polling, anomaly detection, and event publishing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TemperatureSensorPlugin } from '../../../../src/plugins/sensors/temperatureSensorPlugin';
import { EventBus } from '../../../../src/events/eventBus';
import { EventStore } from '../../../../src/events/eventStore';
import { DataPipeline } from '../../../../src/data/dataPipeline';
import { DataStorage } from '../../../../src/data/dataStorage';
import { PluginState, PluginCapability } from '../../../../src/plugins/types';
import { EventType, EventPriority, EventSubscriber } from '../../../../src/events/types';
import { SensorType } from '../../../../src/data/types';

describe('TemperatureSensorPlugin', () => {
  let plugin: TemperatureSensorPlugin;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let dataStorage: DataStorage;
  let dataPipeline: DataPipeline;

  beforeEach(() => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    dataStorage = new DataStorage(':memory:');
    dataPipeline = new DataPipeline(dataStorage, eventBus);

    // Create plugin with test configuration
    plugin = new TemperatureSensorPlugin({
      sensorId: 'temp-sensor-1',
      normalRange: { min: 18, max: 26 }, // Normal room temp in Celsius
      anomalyThreshold: 5, // Degrees change for anomaly
      location: 'Living Room'
    });
  });

  afterEach(async () => {
    await plugin.stop().catch(() => {}); // Ignore errors if not running
    await eventBus.shutdown();
    eventStore.close();
    dataStorage.close();
  });

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('temperature-sensor');
      expect(plugin.metadata.name).toContain('Temperature Sensor');
      expect(plugin.metadata.capability).toBe(PluginCapability.MONITORING);
      expect(plugin.metadata.version).toBeDefined();
    });

    it('should have no dependencies', () => {
      expect(plugin.metadata.dependencies).toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 5000
      });

      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should start and stop successfully', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 5000
      });

      await plugin.start();
      expect(plugin.state).toBe(PluginState.RUNNING);

      await plugin.stop();
      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should be healthy when running', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 5000
      });

      await plugin.start();

      const health = plugin.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.state).toBe(PluginState.RUNNING);
    });
  });

  describe('Temperature Reading', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 100 // Fast polling for tests
      });
      await plugin.start();
    });

    it('should read temperature values', async () => {
      // Poll manually
      await plugin.poll();

      // Check that data was ingested
      const readings = dataStorage.getLatest('temp-sensor-1', 1);
      expect(readings.length).toBe(1);
      expect(readings[0].sensorType).toBe(SensorType.TEMPERATURE);
      expect(readings[0].unit).toBe('°C');
      expect(typeof readings[0].value).toBe('number');
    });

    it('should include sensor metadata in readings', async () => {
      await plugin.poll();

      const readings = dataStorage.getLatest('temp-sensor-1', 1);
      expect(readings[0].metadata).toBeDefined();
      expect(readings[0].metadata?.location).toBe('Living Room');
    });

    it('should publish SENSOR_TRIGGER event for each reading', async () => {
      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_TRIGGER], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalled();
      const event = eventSpy.mock.calls[0][0];
      expect(event.type).toBe(EventType.SENSOR_TRIGGER);
      expect(event.payload.sensorId).toBe('temp-sensor-1');
      expect(event.payload.sensorType).toBe(SensorType.TEMPERATURE);
    });
  });

  describe('Anomaly Detection', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 100
      });
      await plugin.start();
    });

    it('should detect temperature spike anomalies', async () => {
      // Simulate normal reading
      await dataPipeline.ingest({
        sensorId: 'temp-sensor-1',
        sensorType: SensorType.TEMPERATURE,
        value: 22,
        unit: '°C',
        timestamp: new Date(Date.now() - 10000)
      });

      // Mock getCurrentTemperature to return spike
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(30);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalled();
      const event = eventSpy.mock.calls[0][0];
      expect(event.type).toBe(EventType.SENSOR_ANOMALY);
      expect(event.priority).toBe(EventPriority.HIGH);
    });

    it('should detect temperature drop anomalies', async () => {
      // Simulate normal reading
      await dataPipeline.ingest({
        sensorId: 'temp-sensor-1',
        sensorType: SensorType.TEMPERATURE,
        value: 22,
        unit: '°C',
        timestamp: new Date(Date.now() - 10000)
      });

      // Mock getCurrentTemperature to return drop
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(15);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should not trigger anomaly for gradual changes', async () => {
      // Simulate recent reading
      await dataPipeline.ingest({
        sensorId: 'temp-sensor-1',
        sensorType: SensorType.TEMPERATURE,
        value: 22,
        unit: '°C',
        timestamp: new Date(Date.now() - 10000)
      });

      // Mock getCurrentTemperature to return gradual change
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(24);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('Range Monitoring', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 100
      });
      await plugin.start();
    });

    it('should detect out-of-range high temperature', async () => {
      // Mock getCurrentTemperature to return high temp
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(30);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalled();
      const event = eventSpy.mock.calls[0][0];
      expect(event.payload.anomalyType).toBe('out_of_range');
      expect(event.payload.value).toBe(30);
    });

    it('should detect out-of-range low temperature', async () => {
      // Mock getCurrentTemperature to return low temp
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(10);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).toHaveBeenCalled();
      const event = eventSpy.mock.calls[0][0];
      expect(event.payload.anomalyType).toBe('out_of_range');
    });

    it('should not trigger anomaly for in-range temperatures', async () => {
      // Mock getCurrentTemperature to return normal temp
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(22);

      const eventSpy = vi.fn();
      const subscriber: EventSubscriber = {
        id: 'test-subscriber',
        handle: eventSpy,
        canHandle: () => true,
        priority: 0
      };
      eventBus.subscribe([EventType.SENSOR_ANOMALY], subscriber);

      await plugin.poll();

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('Polling Behavior', () => {
    it('should poll at configured interval', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 50 // Very fast for testing
      });

      const pollSpy = vi.spyOn(plugin, 'poll');

      await plugin.start();

      // Wait for multiple polls
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(pollSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle poll errors gracefully', async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 50
      });

      // Mock getCurrentTemperature to throw error
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockRejectedValue(
        new Error('Sensor read failed')
      );

      await plugin.start();

      // Wait for poll attempts
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still be running despite errors
      expect(plugin.state).toBe(PluginState.RUNNING);

      const health = plugin.getHealth();
      expect(health.errorCount).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 100
      });
      await plugin.start();
    });

    it('should track reading count', async () => {
      await plugin.poll();
      await plugin.poll();
      await plugin.poll();

      const stats = (plugin as any).getStatistics();
      expect(stats.totalReadings).toBe(3);
    });

    it('should track last reading time', async () => {
      await plugin.poll();

      const stats = (plugin as any).getStatistics();
      expect(stats.lastReading).toBeInstanceOf(Date);
    });

    it('should track anomaly count', async () => {
      // Mock high temperature
      vi.spyOn(plugin as any, 'getCurrentTemperature').mockResolvedValue(35);

      await plugin.poll();
      await plugin.poll();

      const stats = (plugin as any).getStatistics();
      expect(stats.anomaliesDetected).toBeGreaterThan(0);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, {
        enabled: true,
        pollInterval: 5000,
        settings: {
          sensorId: 'temp-sensor-1',
          normalRange: { min: 18, max: 26 },
          anomalyThreshold: 5,
          location: 'Living Room'
        }
      });
    });

    it('should update sensor configuration', async () => {
      await plugin.updateConfig({
        settings: {
          normalRange: { min: 20, max: 28 },
          anomalyThreshold: 3
        }
      });

      const config = (plugin as any).sensorConfig;
      expect(config.normalRange.min).toBe(20);
      expect(config.normalRange.max).toBe(28);
      expect(config.anomalyThreshold).toBe(3);
    });

    it('should update location', async () => {
      await plugin.updateConfig({
        settings: {
          location: 'Bedroom'
        }
      });

      const config = (plugin as any).sensorConfig;
      expect(config.location).toBe('Bedroom');
    });
  });
});
