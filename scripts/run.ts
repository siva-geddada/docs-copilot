/** Runs a command, turning failures into a clear message rather than a stack trace. */
export async function run(main: () => Promise<void>) {
  try {
    await main();
  } catch (error) {
    const reason = (error as Error).cause ?? (error as Error).message;
    console.error(`
That failed. Check that Ollama is running and your models are pulled.
Details: ${String(reason)}`);
    process.exit(1);
  }
}
