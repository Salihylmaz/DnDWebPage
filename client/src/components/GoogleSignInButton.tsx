import { useEffect, useRef, useState } from 'react';

let initializedClientId: string | undefined;
let activeCredentialHandler: ((credential: string) => void) | undefined;

function initializeGoogleButton(clientId: string, element: HTMLElement): boolean {
  const google = window.google;
  if (!google) return false;

  if (initializedClientId !== clientId) {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => activeCredentialHandler?.(response.credential),
    });
    initializedClientId = clientId;
  }
  google.accounts.id.renderButton(element, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: Math.min(360, Math.max(240, element.clientWidth)),
    locale: 'tr',
  });
  return true;
}

export function GoogleSignInButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [status, setStatus] = useState('');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    callbackRef.current = onCredential;
    activeCredentialHandler = (credential) => callbackRef.current(credential);
  }, [onCredential]);

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    const container = containerRef.current;
    const script = document.getElementById('google-identity-services');
    const render = () => {
      if (!containerRef.current) return;
      if (!initializeGoogleButton(clientId, container)) {
        setStatus('Google giriş bileşeni yüklenemedi. Sayfayı yenileyin.');
      } else {
        setStatus('');
      }
    };

    if (window.google) render();
    else script?.addEventListener('load', render, { once: true });
    return () => {
      script?.removeEventListener('load', render);
      container.replaceChildren();
    };
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <div ref={containerRef} className="flex min-h-10 justify-center" aria-label="Google ile devam et" />
      {status && <p className="mt-2 text-center text-xs text-amber-300" role="status">{status}</p>}
    </div>
  );
}
