/**
 * PluginManager Test Suite
 *
 * Tests plugin lifecycle management, health monitoring,
 * and dependency resolution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from '../../../src/plugins/pluginManager';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import { DataPipeline } from '../../../src/data/dataPipeline';
import { DataStorage } from '../../../src/data/dataStorage';
import {
  Plugin,
  PluginConfig,
  PluginState,
  PluginCapability,
  PluginMetadata
} from '../../../src/plugins/types';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let dataStorage: DataStorage;
  let dataPipeline: DataPipeline;
  let mockPlugin: Plugin;

  beforeEach(() => {
    // Create real dependencies (in-memory)
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    dataStorage = new DataStorage(':memory:');
    dataPipeline = new DataPipeline(dataStorage, eventBus);

    // Create plugin manager
    pluginManager = new PluginManager(eventBus, dataPipeline);

    // Create mock plugin
    mockPlugin = createMockPlugin('test-plugin', PluginCapability.MONITORING);
  });

  afterEach(async () => {
    await pluginManager.shutdown();
    await eventBus.shutdown();
    eventStore.close();
    dataStorage.close();
  });

  describe('Plugin Registration', () => {
    it('should register a plugin', async () => {
      const config: PluginConfig = {
        enabled: true,
        pollInterval: 1000
      };

      await pluginManager.register(mockPlugin, config);

      const plugins = pluginManager.listPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].id).toBe('test-plugin');
    });

    it('should prevent duplicate plugin registration', async () => {
      const config: PluginConfig = { enabled: true };

      await pluginManager.register(mockPlugin, config);

      await expect(
        pluginManager.register(mockPlugin, config)
      ).rejects.toThrow('already registered');
    });

    it('should register multiple plugins', async () => {
      const plugin2 = createMockPlugin('test-plugin-2', PluginCapability.AUTOMATION);

      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.register(plugin2, { enabled: true });

      const plugins = pluginManager.listPlugins();
      expect(plugins.length).toBe(2);
    });

    it('should handle plugin dependencies', async () => {
      const basePlugin = createMockPlugin('base-plugin', PluginCapability.MONITORING);
      const dependentPlugin = createMockPlugin('dependent-plugin', PluginCapability.AUTOMATION, ['base-plugin']);

      await pluginManager.register(basePlugin, { enabled: true });
      await pluginManager.register(dependentPlugin, { enabled: true });

      // Dependent plugin should not start until base plugin is running
      await pluginManager.startPlugin('base-plugin');
      await pluginManager.startPlugin('dependent-plugin');

      const health = pluginManager.getPluginHealth('dependent-plugin');
      expect(health?.state).toBe(PluginState.RUNNING);
    });

    it('should reject plugins with missing dependencies', async () => {
      const dependentPlugin = createMockPlugin('dependent-plugin', PluginCapability.AUTOMATION, ['missing-plugin']);

      await pluginManager.register(dependentPlugin, { enabled: true });

      await expect(
        pluginManager.startPlugin('dependent-plugin')
      ).rejects.toThrow('missing dependencies');
    });
  });

  describe('Plugin Lifecycle', () => {
    beforeEach(async () => {
      await pluginManager.register(mockPlugin, { enabled: true });
    });

    it('should initialize plugin on registration', async () => {
      expect(mockPlugin.initialize).toHaveBeenCalledWith(
        eventBus,
        dataPipeline,
        expect.objectContaining({ enabled: true })
      );
    });

    it('should start a plugin', async () => {
      await pluginManager.startPlugin('test-plugin');

      expect(mockPlugin.start).toHaveBeenCalled();
      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.state).toBe(PluginState.RUNNING);
    });

    it('should stop a plugin', async () => {
      await pluginManager.startPlugin('test-plugin');
      await pluginManager.stopPlugin('test-plugin');

      expect(mockPlugin.stop).toHaveBeenCalled();
      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.state).toBe(PluginState.STOPPED);
    });

    it('should restart a plugin', async () => {
      await pluginManager.startPlugin('test-plugin');
      await pluginManager.restartPlugin('test-plugin');

      expect(mockPlugin.stop).toHaveBeenCalled();
      expect(mockPlugin.start).toHaveBeenCalledTimes(2); // Initial start + restart
    });

    it('should auto-start enabled plugins', async () => {
      const autoPlugin = createMockPlugin('auto-plugin', PluginCapability.MONITORING);
      await pluginManager.register(autoPlugin, { enabled: true });

      await pluginManager.startAll();

      expect(autoPlugin.start).toHaveBeenCalled();
      expect(mockPlugin.start).toHaveBeenCalled();
    });

    it('should not auto-start disabled plugins', async () => {
      const disabledPlugin = createMockPlugin('disabled-plugin', PluginCapability.MONITORING);
      await pluginManager.register(disabledPlugin, { enabled: false });

      await pluginManager.startAll();

      expect(disabledPlugin.start).not.toHaveBeenCalled();
      expect(mockPlugin.start).toHaveBeenCalled(); // This one is enabled
    });
  });

  describe('Plugin Health Monitoring', () => {
    beforeEach(async () => {
      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.startPlugin('test-plugin');
    });

    it('should track plugin health', () => {
      const health = pluginManager.getPluginHealth('test-plugin');

      expect(health).toBeDefined();
      expect(health?.pluginId).toBe('test-plugin');
      expect(health?.state).toBe(PluginState.RUNNING);
      expect(health?.healthy).toBe(true);
    });

    it('should detect unhealthy plugins', async () => {
      // Simulate plugin error
      (mockPlugin.getHealth as any).mockReturnValue({
        pluginId: 'test-plugin',
        state: PluginState.ERROR,
        healthy: false,
        lastCheck: new Date(),
        errorCount: 5,
        uptime: 1000,
        message: 'Connection failed'
      });

      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.healthy).toBe(false);
      expect(health?.errorCount).toBe(5);
    });

    it('should get health for all plugins', async () => {
      const plugin2 = createMockPlugin('plugin-2', PluginCapability.AUTOMATION);
      await pluginManager.register(plugin2, { enabled: true });
      await pluginManager.startPlugin('plugin-2');

      const allHealth = pluginManager.getAllPluginHealth();

      expect(allHealth.length).toBe(2);
      expect(allHealth.every(h => h.state === PluginState.RUNNING)).toBe(true);
    });

    it('should calculate uptime correctly', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.uptime).toBeGreaterThan(50);
    });
  });

  describe('Plugin Configuration', () => {
    beforeEach(async () => {
      await pluginManager.register(mockPlugin, {
        enabled: true,
        pollInterval: 1000,
        settings: { threshold: 50 }
      });
    });

    it('should update plugin configuration', async () => {
      await pluginManager.updatePluginConfig('test-plugin', {
        pollInterval: 2000,
        settings: { threshold: 75 }
      });

      expect(mockPlugin.updateConfig).toHaveBeenCalledWith({
        pollInterval: 2000,
        settings: { threshold: 75 }
      });
    });

    it('should enable a disabled plugin', async () => {
      const disabledPlugin = createMockPlugin('disabled', PluginCapability.MONITORING);
      await pluginManager.register(disabledPlugin, { enabled: false });

      await pluginManager.updatePluginConfig('disabled', { enabled: true });
      await pluginManager.startPlugin('disabled');

      const health = pluginManager.getPluginHealth('disabled');
      expect(health?.state).toBe(PluginState.RUNNING);
    });

    it('should disable a running plugin', async () => {
      await pluginManager.startPlugin('test-plugin');

      await pluginManager.updatePluginConfig('test-plugin', { enabled: false });

      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.state).toBe(PluginState.STOPPED);
    });
  });

  describe('Plugin Discovery', () => {
    it('should list all registered plugins', async () => {
      const plugin2 = createMockPlugin('plugin-2', PluginCapability.AUTOMATION);
      const plugin3 = createMockPlugin('plugin-3', PluginCapability.INTEGRATION);

      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.register(plugin2, { enabled: true });
      await pluginManager.register(plugin3, { enabled: false });

      const plugins = pluginManager.listPlugins();

      expect(plugins.length).toBe(3);
      expect(plugins.map(p => p.id)).toContain('test-plugin');
      expect(plugins.map(p => p.id)).toContain('plugin-2');
      expect(plugins.map(p => p.id)).toContain('plugin-3');
    });

    it('should filter plugins by capability', async () => {
      const autoPlugin = createMockPlugin('auto-plugin', PluginCapability.AUTOMATION);
      const integrationPlugin = createMockPlugin('int-plugin', PluginCapability.INTEGRATION);

      await pluginManager.register(mockPlugin, { enabled: true }); // MONITORING
      await pluginManager.register(autoPlugin, { enabled: true });
      await pluginManager.register(integrationPlugin, { enabled: true });

      const monitoringPlugins = pluginManager.listPluginsByCapability(PluginCapability.MONITORING);
      const automationPlugins = pluginManager.listPluginsByCapability(PluginCapability.AUTOMATION);

      expect(monitoringPlugins.length).toBe(1);
      expect(automationPlugins.length).toBe(1);
    });

    it('should get plugin by ID', async () => {
      await pluginManager.register(mockPlugin, { enabled: true });

      const metadata = pluginManager.getPlugin('test-plugin');

      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe('test-plugin');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.startPlugin('test-plugin');
    });

    it('should track plugin manager statistics', async () => {
      const plugin2 = createMockPlugin('plugin-2', PluginCapability.AUTOMATION);
      const plugin3 = createMockPlugin('plugin-3', PluginCapability.MONITORING);

      await pluginManager.register(plugin2, { enabled: true });
      await pluginManager.register(plugin3, { enabled: false });
      await pluginManager.startPlugin('plugin-2');

      const stats = pluginManager.getStatistics();

      expect(stats.totalPlugins).toBe(3);
      expect(stats.runningPlugins).toBe(2);
      expect(stats.stoppedPlugins).toBe(1);
      expect(stats.erroredPlugins).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin initialization errors', async () => {
      const errorPlugin = createMockPlugin('error-plugin', PluginCapability.MONITORING);
      (errorPlugin.initialize as any).mockRejectedValue(new Error('Init failed'));

      await expect(
        pluginManager.register(errorPlugin, { enabled: true })
      ).rejects.toThrow('Init failed');
    });

    it('should handle plugin start errors', async () => {
      const errorPlugin = createMockPlugin('error-plugin', PluginCapability.MONITORING);
      (errorPlugin.start as any).mockRejectedValue(new Error('Start failed'));

      await pluginManager.register(errorPlugin, { enabled: true });

      await expect(
        pluginManager.startPlugin('error-plugin')
      ).rejects.toThrow('Start failed');
    });

    it('should handle plugin stop errors gracefully', async () => {
      await pluginManager.register(mockPlugin, { enabled: true });

      await pluginManager.startPlugin('test-plugin');

      // Override stop to simulate error and set state to ERROR (like BasePlugin does)
      (mockPlugin.stop as any).mockImplementation(async () => {
        (mockPlugin as any)._setState(PluginState.ERROR);
        throw new Error('Stop failed');
      });

      // Should not throw, but log error
      await pluginManager.stopPlugin('test-plugin');

      const health = pluginManager.getPluginHealth('test-plugin');
      expect(health?.state).toBe(PluginState.ERROR);
    });
  });

  describe('Cleanup', () => {
    it('should shutdown all plugins', async () => {
      const plugin2 = createMockPlugin('plugin-2', PluginCapability.AUTOMATION);

      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.register(plugin2, { enabled: true });
      await pluginManager.startAll();

      await pluginManager.shutdown();

      expect(mockPlugin.stop).toHaveBeenCalled();
      expect(plugin2.stop).toHaveBeenCalled();
    });

    it('should handle errors during shutdown', async () => {
      const errorPlugin = createMockPlugin('error-plugin', PluginCapability.MONITORING);
      (errorPlugin.stop as any).mockRejectedValue(new Error('Stop failed'));

      await pluginManager.register(mockPlugin, { enabled: true });
      await pluginManager.register(errorPlugin, { enabled: true });
      await pluginManager.startAll();

      // Should not throw despite error
      await expect(pluginManager.shutdown()).resolves.not.toThrow();
    });
  });
});

/**
 * Helper to create a mock plugin
 */
function createMockPlugin(id: string, capability: PluginCapability, dependencies?: string[]): Plugin & { _setState: (state: PluginState) => void } {
  const metadata: PluginMetadata = {
    id,
    name: `Test Plugin ${id}`,
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Test',
    capability,
    dependencies
  };

  let currentState = PluginState.STOPPED;

  const mockPlugin = {
    metadata,
    get state() {
      return currentState;
    },
    _setState: (state: PluginState) => {
      currentState = state;
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockImplementation(async () => {
      currentState = PluginState.RUNNING;
    }),
    stop: vi.fn().mockImplementation(async () => {
      currentState = PluginState.STOPPED;
    }),
    getHealth: vi.fn().mockImplementation(() => ({
      pluginId: id,
      state: currentState,
      healthy: currentState === PluginState.RUNNING,
      lastCheck: new Date(),
      errorCount: 0,
      uptime: currentState === PluginState.RUNNING ? 1000 : 0
    })),
    updateConfig: vi.fn().mockResolvedValue(undefined)
  };

  return mockPlugin as Plugin & { _setState: (state: PluginState) => void };
}
