export const nameOf = <T>(name: Extract<keyof T, string>): string => name;
