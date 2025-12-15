export function getBaseUrl() {
  if (typeof window !== "undefined") {
    // ✅ Client-side
    return window.location.origin;
  }

  // ✅ Server-side
    if (process.env.NEXT_PUBLIC_BASE_URL)
      return process.env.NEXT_PUBLIC_BASE_URL;

    if (process.env.VERCEL_URL)
      return `https://${process.env.VERCEL_URL}`;

    return "http://localhost:3000";
}
