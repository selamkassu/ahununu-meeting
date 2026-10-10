import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters"),
  PORT: z.string().regex(/^\d+$/).default("4010"),
  CORS_ORIGIN: z.string().optional().default("http://localhost:5173,http://127.0.0.1:5173"),
  APP_URL: z.string().optional().default("http://localhost:5173"),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("FATAL: Environment variable validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  } else {
    console.log("Environment configuration validated successfully.");
  }
}
