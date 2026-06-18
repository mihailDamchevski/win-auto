import type { Plugin, PluginHooks } from "../api/plugin";
import type { Automation } from "../api/automation";

export type DiagnosticsPluginOptions = {
  screenshotOnFailure?: boolean;
  collectOnAction?: boolean;
};

export class DiagnosticsPlugin implements Plugin {
  readonly name = "diagnostics";
  readonly hooks: PluginHooks;
  private options: Required<DiagnosticsPluginOptions>;

  constructor(options?: DiagnosticsPluginOptions) {
    this.options = {
      screenshotOnFailure: options?.screenshotOnFailure ?? true,
      collectOnAction: options?.collectOnAction ?? false,
    };
    this.hooks = {
      onInstall: this.onInstall.bind(this),
      onUninstall: this.onUninstall.bind(this),
      onError: this.onError.bind(this),
      afterAction: this.options.collectOnAction ? this.afterAction.bind(this) : undefined,
    };
  }

  private automation?: Automation;

  private onInstall(automation: Automation): void {
    this.automation = automation;
  }

  private onUninstall(): void {
    this.automation = undefined;
  }

  private async onError(_action: string, _params: Record<string, unknown>, _error: Error): Promise<void> {
    if (!this.options.screenshotOnFailure) return;
    // Best-effort screenshot on failure
    try {
      if (this.automation) {
        await this.automation.diagnostics.collect();
      }
    } catch {
      // best-effort
    }
  }

  private async afterAction(_action: string, _params: Record<string, unknown>, _result: unknown): Promise<void> {
    if (!this.options.collectOnAction) return;
    // Collect diagnostic info after each action (useful for debugging)
  }
}
