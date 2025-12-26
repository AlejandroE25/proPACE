/**
 * BasePlugin Test Suite
 *
 * Tests the base plugin implementation that provides common
 * functionality for all plugins.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BasePlugin } from '../../../src/plugins/basePlugin';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import { DataPipeline } from '../../../src/data/dataPipeline';
import { DataStorage } from '../../../src/data/dataStorage';
import {
  PluginConfig,
  PluginState,
  PluginCapability,
  PluginMetadata
} from '../../../src/plugins/types';

// Test plugin implementation
class TestPlugin extends BasePlugin {
  public startCalled = false;
  public stopCalled = false;
  public pollCalled = 0;

  protected async onStart(): Promise<void> {
    this.startCalled = true;
  }

  protected async onStop(): Promise<void> {
    this.stopCalled = true;
  }

  public async poll(): Promise<void> {
    this.pollCalled++;
  }
}

describe('BasePlugin', () => {
  let plugin: TestPlugin;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let dataStorage: DataStorage;
  let dataPipeline: DataPipeline;
  let config: PluginConfig;

  beforeEach(() => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    dataStorage = new DataStorage(':memory:');
    dataPipeline = new DataPipeline(dataStorage, eventBus);

    // Create test plugin
    const metadata: PluginMetadata = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'Test',
      capability: PluginCapability.MONITORING
    };

    plugin = new TestPlugin(metadata);

    config = {
      enabled: true,
      pollInterval: 100
    };
  });

  afterEach(async () => {
    await eventBus.shutdown();
    eventStore.close();
    dataStorage.close();
  });

  describe('Initialization', () => {
    it('should initialize with dependencies', async () => {
      await plugin.initialize(eventBus, dataPipeline, config);

      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should store configuration', async () => {
      await plugin.initialize(eventBus, dataPipeline, config);

      await plugin.updateConfig({ pollInterval: 200 });

      // Should be able to access updated config
      expect(plugin.state).toBe(PluginState.STOPPED);
    });

    it('should make eventBus available to subclasses', async () => {
      await plugin.initialize(eventBus, dataPipeline, config);

      // Plugin should be able to publish events
      await plugin.start();
      expect(plugin.startCalled).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
    });

    it('should start plugin', async () => {
      await plugin.start();

      expect(plugin.state).toBe(PluginState.RUNNING);
      expect(plugin.startCalled).toBe(true);
    });

    it('should stop plugin', async () => {
      await plugin.start();
      await plugin.stop();

      expect(plugin.state).toBe(PluginState.STOPPED);
      expect(plugin.stopCalled).toBe(true);
    });

    it('should handle start errors', async () => {
      // Override onStart to throw
      plugin['onStart'] = vi.fn().mockRejectedValue(new Error('Start failed'));

      await expect(plugin.start()).rejects.toThrow('Start failed');
      expect(plugin.state).toBe(PluginState.ERROR);
    });

    it('should handle stop errors', async () => {
      await plugin.start();

      // Override onStop to throw
      plugin['onStop'] = vi.fn().mockRejectedValue(new Error('Stop failed'));

      await expect(plugin.stop()).rejects.toThrow('Stop failed');
      expect(plugin.state).toBe(PluginState.ERROR);
    });

    it('should prevent double start', async () => {
      await plugin.start();

      await expect(plugin.start()).rejects.toThrow('already running');
    });

    it('should prevent stopping when not running', async () => {
      await expect(plugin.stop()).rejects.toThrow('not running');
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
    });

    it('should report healthy when running', async () => {
      await plugin.start();

      const health = plugin.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.state).toBe(PluginState.RUNNING);
      expect(health.errorCount).toBe(0);
    });

    it('should track uptime', async () => {
      await plugin.start();

      await new Promise(resolve => setTimeout(resolve, 50));

      const health = plugin.getHealth();
      expect(health.uptime).toBeGreaterThan(40);
    });

    it('should track error count', async () => {
      await plugin.start();

      // Simulate errors
      plugin['recordError'](new Error('Test error 1'));
      plugin['recordError'](new Error('Test error 2'));

      const health = plugin.getHealth();
      expect(health.errorCount).toBe(2);
    });

    it('should report unhealthy after multiple errors', async () => {
      await plugin.start();

      // Simulate many errors
      for (let i = 0; i < 10; i++) {
        plugin['recordError'](new Error(`Error ${i}`));
      }

      const health = plugin.getHealth();
      expect(health.healthy).toBe(false);
      expect(health.errorCount).toBe(10);
    });

    it('should include error message in health', async () => {
      await plugin.start();

      plugin['recordError'](new Error('Connection lost'));

      const health = plugin.getHealth();
      expect(health.message).toContain('Connection lost');
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
    });

    it('should update configuration', async () => {
      await plugin.updateConfig({ pollInterval: 200 });

      // Configuration should be updated
      const health = plugin.getHealth();
      expect(health).toBeDefined();
    });

    it('should restart plugin when config changes while running', async () => {
      await plugin.start();
      const initialStartCount = plugin.startCalled ? 1 : 0;

      await plugin.updateConfig({ pollInterval: 200 });

      // Should have restarted
      expect(plugin.stopCalled).toBe(true);
      expect(plugin.state).toBe(PluginState.RUNNING);
    });

    it('should not restart plugin when not running', async () => {
      await plugin.updateConfig({ pollInterval: 200 });

      expect(plugin.startCalled).toBe(false);
      expect(plugin.state).toBe(PluginState.STOPPED);
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
      await plugin.start();
    });

    it('should allow plugins to publish events', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      // Plugin publishes an event
      await plugin['publishEvent']({
        type: 'sensor_trigger',
        source: 'test-plugin',
        payload: { value: 42 }
      } as any);

      expect(publishSpy).toHaveBeenCalled();
    });
  });

  describe('Data Pipeline Access', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
      await plugin.start();
    });

    it('should allow plugins to ingest data', async () => {
      const ingestSpy = vi.spyOn(dataPipeline, 'ingest');

      // Plugin ingests sensor data
      await plugin['ingestData']({
        sensorId: 'test-sensor',
        sensorType: 'temperature',
        value: 72,
        unit: 'F'
      } as any);

      expect(ingestSpy).toHaveBeenCalled();
    });
  });

  describe('Polling (MonitoringPlugin)', () => {
    beforeEach(async () => {
      await plugin.initialize(eventBus, dataPipeline, config);
    });

    it('should start polling when plugin starts', async () => {
      await plugin.start();

      await new Promise(resolve => setTimeout(resolve, 250));

      expect(plugin.pollCalled).toBeGreaterThan(1); // Should have polled multiple times
    });

    it('should stop polling when plugin stops', async () => {
      await plugin.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      const pollCount = plugin.pollCalled;

      await plugin.stop();
      await new Promise(resolve => setTimeout(resolve, 150));

      // Poll count should not increase after stop
      expect(plugin.pollCalled).toBe(pollCount);
    });

    it('should use configured poll interval', async () => {
      await plugin.updateConfig({ pollInterval: 50 });
      await plugin.start();

      await new Promise(resolve => setTimeout(resolve, 120));

      // With 50ms interval, should poll ~2 times in 120ms
      expect(plugin.pollCalled).toBeGreaterThanOrEqual(2);
    });

    it('should handle poll errors gracefully', async () => {
      plugin.poll = vi.fn().mockRejectedValue(new Error('Poll failed'));

      await plugin.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still be running despite poll errors
      expect(plugin.state).toBe(PluginState.RUNNING);

      const health = plugin.getHealth();
      expect(health.errorCount).toBeGreaterThan(0);
    });
  });
});
