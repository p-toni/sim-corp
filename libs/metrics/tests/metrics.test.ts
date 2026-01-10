import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from 'prom-client';
import {
  initializeMetrics,
  metricsHandler,
  createCounter,
  createGauge,
  createHistogram,
} from '../src/index.js';

describe('Metrics Library', () => {
  let registry: Registry;

  beforeEach(() => {
    // Use a fresh registry for each test
    registry = new Registry();
  });

  it('should initialize metrics with service name', () => {
    const metrics = initializeMetrics({
      serviceName: 'test-service',
      registry,
      collectDefaultMetrics: false,
    });

    expect(metrics).toBeDefined();
  });

  it('should collect default process metrics', async () => {
    initializeMetrics({
      serviceName: 'test-service',
      registry,
      collectDefaultMetrics: true,
    });

    const metricsOutput = await registry.metrics();
    expect(metricsOutput).toContain('process_cpu_user_seconds_total');
    expect(metricsOutput).toContain('nodejs_heap_size_total_bytes');
  });

  it('should export metrics in Prometheus format', async () => {
    initializeMetrics({
      serviceName: 'test-service',
      registry,
      collectDefaultMetrics: false,
    });

    const output = await metricsHandler(registry);
    expect(output).toContain('simcorp_http_requests_total');
    expect(output).toContain('simcorp_http_request_duration_seconds');
  });

  it('should create custom counter metric', async () => {
    const counter = createCounter({
      name: 'test_counter_total',
      help: 'Test counter',
      registry,
    });

    counter.inc();
    counter.inc(5);

    const metrics = await registry.metrics();
    expect(metrics).toContain('test_counter_total 6');
  });

  it('should create custom gauge metric', async () => {
    const gauge = createGauge({
      name: 'test_gauge',
      help: 'Test gauge',
      registry,
    });

    gauge.set(42);

    const metrics = await registry.metrics();
    expect(metrics).toContain('test_gauge 42');
  });

  it('should create custom histogram metric', async () => {
    const histogram = createHistogram({
      name: 'test_histogram',
      help: 'Test histogram',
      registry,
      buckets: [0.1, 1, 10],
    });

    histogram.observe(0.5);
    histogram.observe(5);

    const metrics = await registry.metrics();
    expect(metrics).toContain('test_histogram_bucket{le="0.1"} 0');
    expect(metrics).toContain('test_histogram_bucket{le="1"} 1');
    expect(metrics).toContain('test_histogram_bucket{le="10"} 2');
  });

  it('should use custom prefix for metric names', async () => {
    initializeMetrics({
      serviceName: 'test-service',
      registry,
      prefix: 'custom',
      collectDefaultMetrics: false,
    });

    const metrics = await registry.metrics();
    expect(metrics).toContain('custom_http_requests_total');
  });
});
