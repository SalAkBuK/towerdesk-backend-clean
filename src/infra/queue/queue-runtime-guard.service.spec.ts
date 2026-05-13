import { env } from '../../config/env';
import { QueueRuntimeGuardService } from './queue-runtime-guard.service';

describe('QueueRuntimeGuardService', () => {
  const originalNodeEnv = env.NODE_ENV;
  const originalRuntime = env.APP_RUNTIME;
  const originalQueueEnabled = env.QUEUE_ENABLED;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    env.APP_RUNTIME = originalRuntime;
    env.QUEUE_ENABLED = originalQueueEnabled;
  });

  it('allows non-production api runtime without queues', () => {
    env.NODE_ENV = 'development';
    env.APP_RUNTIME = 'api';
    env.QUEUE_ENABLED = false;

    const guard = new QueueRuntimeGuardService();

    expect(() => guard.onModuleInit()).not.toThrow();
  });

  it('rejects worker runtime without queues', () => {
    env.NODE_ENV = 'development';
    env.APP_RUNTIME = 'worker';
    env.QUEUE_ENABLED = false;

    const guard = new QueueRuntimeGuardService();

    expect(() => guard.onModuleInit()).toThrow(
      'Worker runtime requires QUEUE_ENABLED=true',
    );
  });

  it('rejects production runtime without queues', () => {
    env.NODE_ENV = 'production';
    env.APP_RUNTIME = 'api';
    env.QUEUE_ENABLED = false;

    const guard = new QueueRuntimeGuardService();

    expect(() => guard.onModuleInit()).toThrow(
      'Production runtime requires QUEUE_ENABLED=true',
    );
  });
});
