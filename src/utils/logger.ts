import { createRequire } from "module";
import { conf } from "../config/logger_conf.js";
import { config } from "../config/index.js";

const require = createRequire(import.meta.url);

// Use js-logging for color configuration but format output ourselves
const jsLogging = require('js-logging');

// Create logger interface that formats exactly like the example
function createLogger(context: Record<string, unknown> = {}) {
  const modulePrefix = Object.keys(context).length > 0
    ? `[${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(" ")}] `
    : "";

  const getCallerInfo = () => {
    // Try to get a stack trace with better line number info
    const originalPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack as any;
    Error.prepareStackTrace = originalPrepareStackTrace;

    if (Array.isArray(stack)) {
      // Skip logger frames and find the first non-logger frame
      for (let i = 1; i < stack.length; i++) {
        const frame = stack[i];
        const fileName = frame.getFileName();
        const lineNumber = frame.getLineNumber();
        const functionName = frame.getFunctionName() || frame.getMethodName() || '';

        if (fileName && 
            !fileName.includes('logger.ts') && 
            !fileName.includes('logger.js') &&
            !fileName.includes('node:internal') &&
            !fileName.includes('node_modules')) {
          
          const file = fileName.replace(/\\/g, "/").split("/").pop() || "unknown";
          
          return {
            file: `${file}:${lineNumber || 1}`,
            function: functionName === 'Object.<anonymous>' ? '' : functionName
          };
        }
      }
    }

    // Fallback to original string parsing if V8 stack access doesn't work
    const stackLines = new Error().stack?.split("\n") || [];
    
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i];
      
      if (line.includes("logger.ts") || 
          line.includes("logger.js") ||
          line.includes("node:internal") ||
          line.includes("node_modules") ||
          !line.includes(" at ")) {
        continue;
      }

      const fileMatch = line.match(/at (.+?) \(file:\/\/\/(.+):(\d+):(\d+)\)/);
      if (fileMatch) {
        const functionName = fileMatch[1].trim();
        const fullPath = fileMatch[2];
        const lineNum = fileMatch[3];
        
        const file = fullPath.replace(/\\/g, "/").split("/").pop() || "unknown";
        
        return {
          file: `${file}:${lineNum}`,
          function: functionName === 'Object.<anonymous>' ? '' : functionName
        };
      }
    }
    
    return { file: "unknown:0", function: "" };
  };

  const log = (level: string, message: string, ...args: unknown[]) => {
    const caller = getCallerInfo();
    const functionPart = caller.function ? ` ${caller.function}` : "";
    
    // Format timestamp with timezone like: 2026-01-21T13:19:21.039+0100
    const now = new Date();
    const timestamp = now.toISOString().replace('Z', '') + 
      (now.getTimezoneOffset() > 0 ? '-' : '+') + 
      String(Math.abs(Math.floor(now.getTimezoneOffset() / 60))).padStart(2, '0') + 
      String(Math.abs(now.getTimezoneOffset() % 60)).padStart(2, '0');
    
    // Format: timestamp <level> file:line function [module=X] message
    const logParts = [
      timestamp,
      `<${level}>`,
      caller.file,
      functionPart,
      modulePrefix,
      message
    ].filter(Boolean);
    
    let fullLogLine = logParts.join(' ');
    
    if (args.length > 0) {
      const argsStr = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      fullLogLine += ` ${argsStr}`;
    }
    
    // Apply colors manually based on level and config
    let coloredOutput = fullLogLine;
    
    // Apply colors from conf.filters object
    const filters = conf.filters as Record<string, string>;
    if (filters[level]) {
      const colorCode = getColorCode(filters[level]);
      if (colorCode) {
        coloredOutput = `${colorCode}${fullLogLine}\x1b[0m`; // Reset at end
      }
    }
    
    console.log(coloredOutput);
  };

  // Helper function to convert color names to ANSI codes
  const getColorCode = (colorName: string): string => {
    const colors: { [key: string]: string } = {
      'black': '\x1b[30m',
      'red': '\x1b[31m',
      'green': '\x1b[32m',
      'yellow': '\x1b[33m',
      'blue': '\x1b[34m',
      'magenta': '\x1b[35m',
      'cyan': '\x1b[36m',
      'white': '\x1b[37m',
      'bright_black': '\x1b[90m',
      'bright_red': '\x1b[91m',
      'bright_green': '\x1b[92m',
      'bright_yellow': '\x1b[93m',
      'bright_blue': '\x1b[94m',
      'bright_magenta': '\x1b[95m',
      'bright_cyan': '\x1b[96m',
      'bright_white': '\x1b[97m'
    };
    return colors[colorName] || '';
  };

  return {
    fatal: (message: string, ...args: unknown[]) => log("emergency", message, ...args),
    error: (message: string, ...args: unknown[]) => log("error", message, ...args),
    warn: (message: string, ...args: unknown[]) => log("warning", message, ...args),
    info: (message: string, ...args: unknown[]) => log("info", message, ...args),
    debug: (message: string, ...args: unknown[]) => log("debug", message, ...args),
    trace: (message: string, ...args: unknown[]) => log("debug", message, ...args),
    child: (extra: Record<string, unknown>) => createLogger({ ...context, ...extra })
  } as const;
}

export const logger = createLogger();
