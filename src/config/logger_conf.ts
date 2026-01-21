const conf = {
  level: 'info', // Will be overridden by env config
  filters: {
    debug: 'white',
    info: 'yellow', 
    notice: 'green',
    warning: 'blue',
    error: 'red',
    critical: 'red',
    alert: 'cyan',
    emergency: 'magenta'
  }
};

export { conf };
