/** An error whose message is safe to show to the person using the app. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
  ) {
    super(message);
  }
}
export const notFound = (what = "Not found") => new AppError(what, 404, "NOT_FOUND");
export const forbidden = (why = "Not allowed") => new AppError(why, 403, "FORBIDDEN");
