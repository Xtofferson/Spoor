import { shareRequest } from '../in-flight';

describe('shareRequest', () => {
  it('shares a request already under way, and runs what follows it once', async () => {
    let finish: (value: string) => void = () => {};
    const start = jest.fn(() => new Promise<string>((resolve) => (finish = resolve)));

    // The Trips card and the open trip both ask for the same route at once.
    const first = shareRequest('route:a', start);
    const second = shareRequest('route:a', start);
    expect(start).toHaveBeenCalledTimes(1);

    finish('plan');
    await expect(Promise.all([first, second])).resolves.toEqual(['plan', 'plan']);
  });

  it('starts a new request once the last one has finished, or for something else', async () => {
    const start = jest.fn(() => Promise.resolve('plan'));
    await shareRequest('route:b', start);
    await shareRequest('route:b', start);
    await shareRequest('route:c', start);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it('lets a failed request be tried again', async () => {
    const failing = jest.fn(() => Promise.reject(new Error('busy')));
    await expect(shareRequest('route:d', failing)).rejects.toThrow('busy');
    const working = jest.fn(() => Promise.resolve('plan'));
    await expect(shareRequest('route:d', working)).resolves.toBe('plan');
  });
});
