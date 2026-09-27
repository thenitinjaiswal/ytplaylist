import { memo, useEffect, useRef } from "react";

let apiPromise = null;

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[data-yt-api="1"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset["ytApi"] = "1";
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

/**
 * The lesson player. Created exactly once through the official YouTube IFrame
 * Player API; floating windows only move/resize the container, so playback and
 * the current timestamp survive every drag, resize and mode change.
 */
export const WorkspaceVideo = memo(function WorkspaceVideo({
  videoId,
  startAt,
  title,
  playbackSpeed = 1,
  onApi,
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const startRef = useRef(startAt);
  const speedRef = useRef(playbackSpeed);

  useEffect(() => {
    const rate = Number(playbackSpeed) || 1;
    speedRef.current = rate;
    if (playerRef.current?.setPlaybackRate) {
      try {
        playerRef.current.setPlaybackRate(rate);
      } catch (err) {
        console.warn("Could not set playback rate on player:", err);
      }
    }
  }, [playbackSpeed]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadYouTubeApi().then((yt) => {
      if (cancelled || !hostRef.current) return;
      const mount = document.createElement("div");
      mount.style.width = "100%";
      mount.style.height = "100%";
      hostRef.current.appendChild(mount);
      const player = new yt.Player(mount, {
        videoId,
        playerVars: {
          start: Math.floor(startRef.current),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            try {
              const rate = Number(speedRef.current) || 1;
              e.target.setPlaybackRate(rate);
            } catch {}
          },
          onStateChange: (e) => {
            // Enforce preferred playback rate when playback starts or buffers
            if (e.data === yt.PlayerState.PLAYING || e.data === yt.PlayerState.BUFFERING) {
              try {
                const rate = Number(speedRef.current) || 1;
                e.target.setPlaybackRate(rate);
              } catch {}
            }
          },
        },
      });
      playerRef.current = player;
      onApi?.({
        play: () => player.playVideo?.(),
        pause: () => player.pauseVideo?.(),
        seekTo: (seconds) => player.seekTo?.(seconds, true),
        setPlaybackRate: (rate) => {
          const r = Number(rate) || 1;
          speedRef.current = r;
          try {
            player.setPlaybackRate?.(r);
          } catch {}
        },
        getPlaybackRate: () => {
          try {
            return player.getPlaybackRate?.() ?? speedRef.current;
          } catch {
            return speedRef.current;
          }
        },
        getCurrentTime: () => {
          try {
            return player.getCurrentTime?.() ?? 0;
          } catch {
            return 0;
          }
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
    };
    // Intentionally keyed only on the video: re-running would reload the player.
  }, [videoId, onApi]);

  return (
    <div
      ref={hostRef}
      title={title}
      aria-label={title}
      className="size-full bg-black [&>div]:size-full [&_iframe]:size-full [&_iframe]:border-0"
    />
  );
});
