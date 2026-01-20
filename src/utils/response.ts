export const success = <T>(data: T) => ({ success: true, data });
export const failure = (message: string) => ({ success: false, message });