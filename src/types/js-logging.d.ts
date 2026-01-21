declare module "js-logging" {
  interface JsLoggingInstance {
    fatal(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    warning?(...args: unknown[]): void;
    info(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    trace?(...args: unknown[]): void;
  }

  interface JsLoggingModule {
    (config?: unknown): JsLoggingInstance;
    console?: (config?: unknown) => JsLoggingInstance;
  }

  const jsLogging: JsLoggingModule;
  export default jsLogging;
}
