import type { Plugin, PluginHooks } from "../api/plugin";
import type { Automation } from "../api/automation";

export type LoggingPluginOptions = {
  logLevel?: "info" | "debug";
  logActions?: boolean;
  logErrors?: boolean;
};

export class LoggingPlugin implements Plugin {
  readonly name = "logging";
  readonly hooks: PluginHooks;
  private options: Required<LoggingPluginOptions>;

  constructor(options?: LoggingPluginOptions) {
    this.options = {
      logLevel: options?.logLevel ?? "info",
      logActions: options?.logActions ?? true,
      logErrors: options?.logErrors ?? true,
    };
    this.hooks = {
      onInstall: this.onInstall.bind(this),
      beforeAction: this.options.logActions ? this.beforeAction.bind(this) : undefined,
      afterAction: this.options.logActions ? this.afterAction.bind(this) : undefined,
      onError: this.options.logErrors ? this.onError.bind(this) : undefined,
    };
  }

  private onInstall(automation: Automation): void {
    this.log("info", `LoggingPlugin installed on Automation`);
    void automation;
  }

  private onUninstall(): void {
    this.log("info", "LoggingPlugin uninstalled");
  }

  private async beforeAction(action: string, params: Record<string, unknown>): Promise<void | false> {
    this.log("debug", `[${action}] params=${JSON.stringify(params)}`);
  }

  private async afterAction(action: string, params: Record<string, unknown>, result: unknown): Promise<void> {
    this.log("info", `[${action}] completed`);
    void params;
    void result;
  }

  private async onError(action: string, params: Record<string, unknown>, error: Error): Promise<void> {
    this.log("info", `[${action}] ERROR: ${error.message}`);
    void params;
  }

  private log(level: string, message: string): void {
    if (level === "debug" && this.options.logLevel !== "debug") return;
    const prefix = this.options.logLevel === "debug" ? `[win-auto:plugin:${level}]` : "[win-auto]";
    console.log(`${prefix} ${message}`);
  }
}
