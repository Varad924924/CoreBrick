import { useState, type FormEvent } from "react";

const API_URL = "http://127.0.0.1:8000";

type Props = {
  onBack: () => void;
};

type SignupResponse = {
  message?: string;
  detail?: string;
  signup_token?: string;
  expires_in_seconds?: number;
  resend_after_seconds?: number;
};

async function readSignupResponse(
  response: Response,
): Promise<SignupResponse> {
  return (await response.json().catch(() => ({}))) as SignupResponse;
}

function ArchitectSignup({ onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"request" | "verify" | "verified">(
    "request",
  );
  const [signupToken, setSignupToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/auth/architect/signup/request-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        },
      );

      const data = await readSignupResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Could not request verification code (${response.status}).`,
        );
      }

      setStage("verify");
      setNotice(
        data.message ?? "Verification code sent. Check your email inbox.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/auth/architect/signup/verify-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp: otp.trim(),
          }),
        },
      );

      const data = await readSignupResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Email verification failed (${response.status}).`,
        );
      }

      if (!data.signup_token) {
        throw new Error("Verification succeeded but no sign-up token was returned.");
      }

      setSignupToken(data.signup_token);
      setOtp("");
      setStage("verified");
      setNotice(data.message ?? "Email verified successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-xl">
        <a href="/" className="text-xl font-black tracking-tight">
          CORE <span className="text-amber-700">BRICK.</span>
        </a>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-800">
          Architect portal
        </p>

        {stage === "request" && (
          <>
            <h1 className="mt-3 text-3xl font-semibold">Create your account</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Start with your email and password. We will send you a
              verification code before you proceed.
            </p>

            <form onSubmit={requestOtp} className="mt-6">
              <label className="block text-sm font-medium text-stone-700">
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-stone-700">
                Password
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
                <span className="mt-1 block text-xs text-stone-500">
                  Use at least 12 characters.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending code..." : "Send verification code"}
              </button>
            </form>
          </>
        )}

        {stage === "verify" && (
          <>
            <h1 className="mt-3 text-3xl font-semibold">Verify your email</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Enter the six-digit verification code sent to{" "}
              <strong className="break-all">{email.trim().toLowerCase()}</strong>.
              The code expires in 10 minutes.
            </p>

            <form onSubmit={verifyOtp} className="mt-6">
              <label className="block text-sm font-medium text-stone-700">
                Verification code
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify email"}
              </button>
            </form>

            <p className="mt-4 text-xs leading-5 text-stone-500">
              A resend option will be added with the next sign-up improvement.
              Do not share your verification code with anyone.
            </p>
          </>
        )}

        {stage === "verified" && signupToken && (
          <>
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-green-800">
                Email verified successfully
              </p>
              <p className="mt-2 text-sm leading-6 text-green-800">
                Your email verification is complete. No architect account has
                been created yet.
              </p>
            </div>

            <h2 className="mt-6 text-lg font-semibold">Next steps</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The next stage is to complete your professional profile and
              verify the required ₹1 sign-up payment. Account creation will
              remain blocked until that payment flow is implemented.
            </p>
          </>
        )}

        {notice && stage !== "verified" && (
          <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="mt-6 w-full rounded-lg border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
        >
          Back to sign in
        </button>
      </section>
    </main>
  );
}

export default ArchitectSignup;
