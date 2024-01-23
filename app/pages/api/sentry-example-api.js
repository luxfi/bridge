// A faulty API route to test Sentry's error monitoring
export default function handler(req, res) {
  console.log(req, res)
  throw new Error("Sentry Example API Route Error");
  // res.status(200).json({ name: "John Doe" });
}
