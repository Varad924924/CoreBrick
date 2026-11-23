import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";


declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline";
              size: "large";
              text: "continue_with";
              shape: "rectangular";
              width: number;
            },
          ) => void;
        };
      };
    };
  }
}

const API_URL = "http://127.0.0.1:8000";

type RegisteredUser = {
  id?: string;
  email: string;
  role: string;
  is_active: boolean;
  architect_approval_status?: string | null;
};

type SignupResult = {
  access_token: string;
  user: RegisteredUser;
};

type ApiResult = {
  action?: "login" | "complete_profile";
  email?: string;
  full_name?: string;
  detail?: string;
  message?: string;
  resend_after_seconds?: number;
  signup_token?: string;
  access_token?: string;
  user?: RegisteredUser;
};

type Props = {
  onBack: () => void;
  onRegistered: (result: SignupResult) => void;
};

async function readResponse(response: Response): Promise<ApiResult> {
  return (await response.json().catch(() => ({}))) as ApiResult;
}

function ArchitectSignup({ onBack, onRegistered }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  const [stage, setStage] = useState<"request" | "verify" | "profile">(
    "request",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const googleButtonRef = useRef<HTMLDivElement>(null);


  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setLoading(true);
      setError("");
      setNotice("");

      try {
        const response = await fetch(
          `${API_URL}/auth/architect/signup/google`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          },
        );

        const data = await readResponse(response);

        if (!response.ok) {
          throw new Error(
            data.detail ?? `Google sign-in failed (${response.status}).`,
          );
        }

        if (data.action === "login") {
          if (
            !data.access_token ||
            !data.user ||
            data.user.role !== "architect" ||
            !data.user.is_active
          ) {
            throw new Error("Google returned an invalid architect login response.");
          }

          onRegistered({
            access_token: data.access_token,
            user: data.user,
          });
          return;
        }

        if (data.action === "complete_profile") {
          if (!data.signup_token || !data.email) {
            throw new Error("Google verification did not return a valid signup session.");
          }

          setEmail(data.email);
          setPassword("");
          setFullName(data.full_name ?? "");
          setSignupToken(data.signup_token);
          setStage("profile");
          setNotice(
            "Google email verified successfully. Complete your professional profile.",
          );
          return;
        }

        throw new Error("Unexpected response from Google sign-in.");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to complete Google sign-in.",
        );
      } finally {
        setLoading(false);
      }
    },
    [onRegistered],
  );

  useEffect(() => {
    if (stage !== "verify" || resendCountdown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [stage, resendCountdown]);


  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    let cancelled = false;

    if (!clientId) {
      setError("Google sign-in is not configured. Use email and OTP signup.");
      return;
    }

    function initializeGoogle() {
      if (cancelled || !window.google?.accounts.id) return;

      const container = googleButtonRef.current;
      if (!container) return;

      container.replaceChildren();

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (!response.credential) {
            setError("Google did not return an ID token. Please try again.");
            return;
          }

          void handleGoogleCredential(response.credential);
        },
      });

      window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(container.clientWidth || 360, 400),
      });
    }

    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    if (window.google?.accounts.id) {
      initializeGoogle();
    } else if (script) {
      script.addEventListener("load", initializeGoogle);
    } else {
      setError("Google sign-in library could not be loaded. Refresh the page.");
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", initializeGoogle);
    };
  }, [handleGoogleCredential]);

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

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Could not request OTP (${response.status}).`,
        );
      }

      setStage("verify");
      setOtp("");
      setResendCountdown(data.resend_after_seconds ?? 60);
      setNotice(data.message ?? "Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
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

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Could not resend OTP (${response.status}).`,
        );
      }

      setOtp("");
      setResendCountdown(data.resend_after_seconds ?? 60);
      setNotice(data.message ?? "A new verification code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend OTP.");
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

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Email verification failed (${response.status}).`,
        );
      }

      if (!data.signup_token) {
        throw new Error("No sign-up token was returned.");
      }

      setSignupToken(data.signup_token);
      setOtp("");
      setStage("profile");
      setNotice("Email verified successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function completeSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/auth/architect/signup/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            signup_token: signupToken,
            full_name: fullName.trim(),
            phone: phone.trim(),
            bio: bio.trim() || null,
          }),
        },
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail ?? `Registration failed (${response.status}).`,
        );
      }

      if (
        !data.access_token ||
        !data.user ||
        data.user.role !== "architect" ||
        !data.user.is_active
      ) {
        throw new Error("The server returned an invalid registration response.");
      }

      onRegistered({
        access_token: data.access_token,
        user: data.user,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete registration.",
      );
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    ["request", "Account"],
    ["verify", "Email OTP"],
    ["profile", "Profile"],
  ] as const;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-xl">
        <a href="/" className="text-xl font-black tracking-tight">
          CORE <span className="text-amber-700">BRICK.</span>
        </a>

        <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-800">
          Architect portal
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {steps.map(([key, label], index) => {
            const activeIndex = steps.findIndex(([value]) => value === stage);
            const complete = index < activeIndex;
            const active = key === stage;

            return (
              <div
                key={key}
                className={`rounded-lg px-2 py-3 text-center text-xs font-semibold ${
                  complete
                    ? "bg-green-50 text-green-800"
                    : active
                      ? "bg-amber-100 text-amber-900"
                      : "bg-stone-100 text-stone-500"
                }`}
              >
                {index + 1}. {label}
              </div>
            );
          })}
        </div>

        {stage === "request" && (
          <>
            <h1 className="mt-7 text-3xl font-semibold">Create your account</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Enter your email and create a password. We will send a
              verification code before you continue.
            </p>

            <form onSubmit={requestOtp} className="mt-6">
              <label className="block text-sm font-medium text-stone-700">
                Email address *
                <input
                  required
                  type="email"
                  maxLength={255}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-stone-700">
                Password *
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
                  Minimum 12 characters.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
              >
                {loading ? "Sending OTP..." : "Send verification code"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />
              OR
              <span className="h-px flex-1 bg-stone-200" />
            </div>

            <p className="mb-3 text-center text-sm text-stone-600">
              Continue using your Google account
            </p>

            <div
              ref={googleButtonRef}
              className="flex min-h-11 w-full justify-center"
            />
          </>
        )}

        {stage === "verify" && (
          <>
            <h1 className="mt-7 text-3xl font-semibold">Verify your email</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Enter the six-digit code sent to{" "}
              <strong className="break-all">{email.trim().toLowerCase()}</strong>.
              The code expires in 10 minutes.
            </p>

            <form onSubmit={verifyOtp} className="mt-6">
              <label className="block text-sm font-medium text-stone-700">
                Verification code *
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
                className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify email"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => void resendOtp()}
              disabled={loading || resendCountdown > 0}
              className="mt-3 w-full rounded-lg border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Sending new code..."
                : resendCountdown > 0
                  ? `Resend code in ${resendCountdown}s`
                  : "Resend verification code"}
            </button>

            <p className="mt-4 text-xs leading-5 text-stone-500">
              Do not share your verification code with anyone.
            </p>
          </>
        )}

        {stage === "profile" && (
          <>
            <h1 className="mt-7 text-3xl font-semibold">
              Professional profile
            </h1>
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              Email verified: {email.trim().toLowerCase()}
            </div>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Enter your professional details to create your architect
              account. There is no signup fee in Version 1.
            </p>

            <form onSubmit={completeSignup} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-stone-700">
                Full name *
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <label className="block text-sm font-medium text-stone-700">
                Phone number *
                <input
                  required
                  type="tel"
                  minLength={7}
                  maxLength={30}
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <label className="block text-sm font-medium text-stone-700">
                Professional bio
                <textarea
                  maxLength={5000}
                  rows={4}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Tell us about your architectural experience and expertise."
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                />
              </label>

              <button
                type="submit"
                disabled={loading || !signupToken}
                className="w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Complete registration"}
              </button>
            </form>
          </>
        )}

        {notice && (
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
