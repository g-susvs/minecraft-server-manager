export class Logger {
  static log(message: string) {
    console.log(message);
  }

  static error(error: unknown) {
    console.error(error);
  }
}
