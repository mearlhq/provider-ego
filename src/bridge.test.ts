import { expect, it, vi } from 'vitest';
import { EgoBridge } from './bridge.js';

it('uses a short-lived independent control channel and closes it on failure', async () => {
  const pageChannel = new EgoBridge();
  const request = vi.spyOn(EgoBridge.prototype, 'request').mockRejectedValue(new Error('user still controls the task'));
  const close = vi.spyOn(EgoBridge.prototype, 'close').mockImplementation(() => {});
  try {
    await expect(pageChannel.control('resume', { spaceId: 7 }, 123)).rejects.toThrow('user still controls');
    expect(request.mock.instances[0]).not.toBe(pageChannel);
    expect(request).toHaveBeenCalledWith('resume', { spaceId: 7 }, 123);
    expect(close.mock.instances[0]).toBe(request.mock.instances[0]);
    expect(close).toHaveBeenCalledOnce();
  } finally { vi.restoreAllMocks(); }
});
