import React, { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, HelpCircle, Sparkles, CheckCircle2, Copy, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Primitives";

export interface GoogleAuthButtonProps {
  mode: "signin" | "signup";
  onSuccess?: (isNewUser: boolean, isPending?: boolean, message?: string) => void;
  onError?: (errorMessage: string) => void;
  className?: string;
  departmentId?: string;
  jobTitle?: string;
}

export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  mode,
  onSuccess,
  onError,
  className = "",
  departmentId,
  jobTitle,
}: GoogleAuthButtonProps) {
  const { loginWithGoogle, googleClientId, isGoogleConfigured } = useAuth();
  const [loading, setLoading] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const hiddenBtnRef = useRef<HTMLDivElement>(null);

  const isConfigured = Boolean(
    isGoogleConfigured &&
    googleClientId &&
    googleClientId.length > 10 &&
    !googleClientId.includes("your-google")
  );

  // Initialize official Google Identity Services button if configured
  useEffect(() => {
    const google = typeof window !== "undefined" ? (window as any).google : undefined;
    if (!isConfigured || !google?.accounts?.id || !hiddenBtnRef.current) return;

    try {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          if (!response?.credential) {
            onError?.("Failed to obtain credential from Google.");
            return;
          }
          setLoading(true);
          try {
            const result = await loginWithGoogle(response.credential, mode, {
              departmentId,
              jobTitle,
            });
            onSuccess?.(result.isNewUser, result.isPending, result.message);
          } catch (err: any) {
            onError?.(err?.message || "Google authentication failed.");
          } finally {
            setLoading(false);
          }
        },
      });

      // Render official hidden button that can be clicked programmatically
      google.accounts.id.renderButton(hiddenBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: mode === "signup" ? "signup_with" : "signin_with",
        shape: "rectangular",
        width: 320,
      });
    } catch (e) {
      console.warn("[GoogleAuthButton] GSI init error:", e);
    }
  }, [isConfigured, googleClientId, mode, departmentId, jobTitle, loginWithGoogle, onSuccess, onError]);

  const handleClick = () => {
    if (!isConfigured) {
      setSetupModalOpen(true);
      return;
    }

    // If configured, trigger Google Identity prompt
    if (hiddenBtnRef.current) {
      const buttonEl = hiddenBtnRef.current.querySelector('div[role="button"]') as HTMLElement;
      if (buttonEl) {
        buttonEl.click();
        return;
      }
    }

    const google = typeof window !== "undefined" ? (window as any).google : undefined;
    if (google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      setSetupModalOpen(true);
    }
  };

  // Demo login handler for development or preview before creating Google Cloud credentials
  const handleDevDemoAuth = async (demoEmail: string, demoName: string) => {
    setLoading(true);
    try {
      // Create a test client-side payload signed or structured for dev endpoint
      const mockPayload = {
        sub: `google_dev_${demoEmail.replace(/[^a-zA-Z0-9]/g, "_")}`,
        email: demoEmail,
        name: demoName,
        picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(demoName)}&backgroundColor=0B7A6B,AED580`,
        email_verified: true,
      };

      // Base64 encode JSON to pass as mock token for development verification
      const mockToken = btoa(JSON.stringify(mockPayload));
      const result = await loginWithGoogle(mockToken, mode, {
        departmentId,
        jobTitle,
      });
      setSetupModalOpen(false);
      onSuccess?.(result.isNewUser);
    } catch (err: any) {
      onError?.(err?.message || "Demo Google authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const copyEnvSample = () => {
    const text = `GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"`;
    navigator.clipboard.writeText(text);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const buttonText = mode === "signup" ? "Sign up with Google" : "Sign in with Google";

  return (
    <>
      {/* Hidden element where Google Identity Services mounts its native iframe button */}
      <div ref={hiddenBtnRef} className="hidden" aria-hidden="true" />

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`relative flex w-full items-center justify-center gap-3 rounded-xl border border-slate2-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate2-700 shadow-sm transition-all duration-200 hover:border-slate2-300 hover:bg-slate2-50/80 hover:shadow active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus-ring ${className}`}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin text-brand" />
        ) : (
          <GoogleIcon className="h-4 w-4 shrink-0" />
        )}
        <span>{loading ? "Authenticating with Google..." : buttonText}</span>
      </button>

      {/* Setup & Developer Preview Modal */}
      <Modal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        title="Google Authentication Configuration"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-teal-50/80 border border-teal-200/90 p-4">
            <GoogleIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs text-slate2-700 space-y-1">
              <p className="font-semibold text-slate2-800 text-sm">
                Google Cloud Client ID Required
              </p>
              <p className="text-slate2-600 leading-relaxed">
                Google Sign In & Sign Up require a free OAuth 2.0 Client ID from Google Cloud Console. Follow the quick steps below to connect your real Google credentials.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate2-200 bg-slate2-50/60 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate2-500">
              Quick Setup Steps (2 minutes)
            </p>
            <ol className="text-xs text-slate2-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Open the{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  Google Cloud Console (Credentials)
                </a>
                .
              </li>
              <li>Click <strong>Create Credentials</strong> &rarr; <strong>OAuth client ID</strong>.</li>
              <li>Select Application type: <strong>Web application</strong>.</li>
              <li>
                Add Authorized JavaScript origins:{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate2-800 border border-slate2-200">
                  http://localhost:5173
                </code>
              </li>
              <li>
                Paste your Client ID into <code className="font-mono text-[11px]">backend/.env</code> and <code className="font-mono text-[11px]">frontend/.env</code>.
              </li>
            </ol>

            <div className="flex items-center justify-between rounded-lg bg-slate2-900 p-2.5 text-xs text-slate2-200 font-mono">
              <span className="truncate pr-2">
                GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
              </span>
              <button
                type="button"
                onClick={copyEnvSample}
                className="shrink-0 flex items-center gap-1 text-[11px] font-sans rounded bg-white/10 px-2 py-1 text-white hover:bg-white/20 transition-colors"
              >
                {copiedEnv ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copiedEnv ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Quick Demo Simulator for immediate testing */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <Sparkles size={16} className="text-emerald-700" />
              <span>Instant Developer Testing Mode</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Want to test the full Google Sign In or Sign Up flow right now without waiting for Google Cloud keys? Click a test profile below:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  handleDevDemoAuth(
                    "dawit.bekele@ahununulogistics.com",
                    "Dawit Bekele (Admin)"
                  )
                }
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-white border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors shadow-sm"
              >
                <CheckCircle2 size={14} className="text-emerald-600" />
                Sign in with Dawit Bekele
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDevDemoAuth(
                    `google.user.${Date.now().toString().slice(-4)}@ahununulogistics.com`,
                    "New Google Member"
                  )
                }
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 text-white px-3 py-2 text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-sm"
              >
                <Sparkles size={14} />
                Sign up as New Google User
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate2-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSetupModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
