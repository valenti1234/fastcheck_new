import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import packageJson from '../../../package.json';

const CURRENT_VERSION = packageJson.version as string;

const VersionChangeNotifier = () => {
  const shownRef = useRef(false);
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    let intervalId: number | undefined;

    const showReloadToast = (latest: string) => {
      if (shownRef.current) return;
      shownRef.current = true;

      const message = (
        <div className="flex items-start gap-3">
          <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">Nueva versión disponible</div>
            <div className="text-gray-700 dark:text-gray-300">v{CURRENT_VERSION} → v{latest}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                if (toastIdRef.current) toast.dismiss(toastIdRef.current);
                window.location.reload();
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              Actualizar
            </button>
            <button
              onClick={() => {
                if (toastIdRef.current) toast.dismiss(toastIdRef.current);
              }}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Ignorar
            </button>
          </div>
        </div>
      );

      const id = toast.custom(message, { duration: Infinity, position: 'top-right' });
      toastIdRef.current = id as unknown as string; // react-hot-toast types allow string | number
    };

    const fetchLatestVersion = async () => {
      try {
        const res = await fetch(`/package.json?ts=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const latest = data?.version as string | undefined;
        if (latest && latest !== CURRENT_VERSION) {
          showReloadToast(latest);
        }
      } catch (err) {
        // Silent fail; do not spam user
      }
    };

    // Initial check shortly after mount
    const initialTimeout = window.setTimeout(fetchLatestVersion, 3000);
    // Poll every 60 seconds
    intervalId = window.setInterval(fetchLatestVersion, 60_000) as unknown as number;

    // Also check when tab becomes visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLatestVersion();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(initialTimeout);
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
};

export default VersionChangeNotifier;