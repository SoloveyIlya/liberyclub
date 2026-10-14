const player = document.querySelector(".player");

track("view");

player.addEventListener("click", () => {
  const src = player.dataset.video;
  if (!src || player.dataset.playing === "true") return;



  const isFile = /\.(mp4|webm|ogg)(\?|$)/i.test(src);
  const media = isFile ? document.createElement("video") : document.createElement("iframe");

  if (isFile) {
    media.src = src;
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
    let started = false;
    let maximum = 0;
    let sent = -1;
    const flush = () => {
      if (!started || maximum === sent) return;
      track("watch", { position: maximum });
      sent = maximum;
    };
    media.addEventListener("playing", () => {
      if (!started) { started = true; track("play"); }
    });
    media.addEventListener("timeupdate", () => {
      if (!started || media.seeking || media.paused) return;
      maximum = Math.max(maximum, media.currentTime);
      if (maximum - sent >= 10) flush();
    });
    media.addEventListener("pause", flush);
    media.addEventListener("ended", () => { maximum = media.duration; flush(); });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  } else {
    const url = new URL(src, window.location.href);
    if (!url.searchParams.has("autoplay")) url.searchParams.set("autoplay", "1");
    media.src = url.toString();
    media.allow = "autoplay; fullscreen; picture-in-picture";
    media.allowFullscreen = true;
    media.title = "Видео";
  }

  player.replaceChildren(media);
  player.dataset.playing = "true";
  player.style.cursor = "default";
});

document.querySelector(".cta").addEventListener("click", () => track("cta"));
