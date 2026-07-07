import type { Backend } from "./backend";
import type { PluginManager } from "./plugin";

/**
 * Creates a Proxy-backed wrapper around a Backend that dispatches plugin hooks
 * before/after every method call. Unlike a manually maintained delegation class,
 * this Proxy approach guarantees 1:1 coverage with the Backend interface —
 * any method added to Backend is automatically instrumented with no boilerplate.
 *
 * Methods that are not worth instrumenting (e.g. simple getters) bypass hooks
 * via a static allowlist to avoid unnecessary dispatch overhead.
 *
 * Usage:
 *   const backend = PluginBackendProxy(myBackend, pluginManager);
 */
export function PluginBackendProxy(inner: Backend, plugins: PluginManager): Backend {
  // Methods that bypass plugin hooks entirely (simple getters / no side effects)
  const passthrough = new Set<string>([
    "ping",
    "getWindowInfo",
    "getProcessImageName",
    "isProcessRunning",
    "isProcessElevated",
    "findProcessesByName",
    "findDialogs",
    "getDialogControls",
    "buildElementPath",
    "getToggleState",
    "inspectWindowTree",
    "inspectHwndTree",
    "debugDiscovery",
    "startWinEventWatcher",
    "stopWinEventWatcher",
  ]);

  const handler: ProxyHandler<Backend> = {
    get(target, prop: string | symbol, receiver) {
      // Special: expose the inner backend for direct access
      if (prop === "getInner") return () => inner;

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      // Pass through methods in the allowlist without wrapping
      if (typeof prop === "string" && passthrough.has(prop)) {
        return value.bind(target);
      }

      // Wrap every other method with plugin hooks
      return (...args: unknown[]) => {
        const action = `backend:${String(prop)}`;
        return (async () => {
          const proceed = await plugins.dispatchBeforeAction(action, { args });
          if (!proceed) throw new Error(`Action "${action}" cancelled by plugin`);
          try {
            const result = await value.call(target, ...args);
            await plugins.dispatchAfterAction(action, { args }, result);
            return result;
          } catch (err) {
            await plugins.dispatchOnError(action, { args }, err instanceof Error ? err : new Error(String(err)));
            throw err;
          }
        })();
      };
    },
  };

  return new Proxy(inner, handler) as Backend & { getInner(): Backend };
}
