import { useEffect, useRef, useState } from "react";

// Swipeable photo slider (native scroll-snap, so a finger swipe just works) with arrows and dots, the same look as the
// venue page slider. Photos load lazily. A photo whose link is broken is dropped; if none are left, nothing is drawn.
export function PhotoSlider({ photos, className = "" }) {
  const [broken, setBroken] = useState(() => new Set());
  const [index, setIndex] = useState(0);
  const track = useRef(null);
  const shown = photos.filter((p) => !broken.has(p.id));
  if (shown.length === 0) return null;
  const many = shown.length > 1;

  const goTo = (i) => {
    const el = track.current;
    if (!el) return;
    const n = (i + shown.length) % shown.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  // the index changes only when the visible photo changes, so scrolling does not redraw the page
  const onScroll = (e) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    setIndex((old) => (old === i ? old : i));
  };
  const active = Math.min(index, shown.length - 1);

  return (
    <div className={`relative ${className}`} data-testid="party-gallery">
      <div ref={track} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden aspect-video bg-gradient-to-br from-surface to-[#2A1512]">
        {shown.map((p) => (
          <img
            key={p.id}
            src={p.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken((s) => (s.has(p.id) ? s : new Set(s).add(p.id)))}
            className="w-full h-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {many && (
        <>
          <button type="button" onClick={() => goTo(active - 1)} aria-label="Previous photo" className="absolute top-1/2 left-2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white text-lg leading-none flex items-center justify-center hover:bg-black/70">‹</button>
          <button type="button" onClick={() => goTo(active + 1)} aria-label="Next photo" className="absolute top-1/2 right-2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white text-lg leading-none flex items-center justify-center hover:bg-black/70">›</button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {shown.map((p, i) => (
              <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${i === active ? "bg-white" : "bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The venue's own gallery on the party page. ONE read, tied to the venue id only (never to the api object or a timer).
// Whether a photo is visible is decided by the existing database rule (photos of approved venues only).
export function PartyGallery({ venueId, api }) {
  const [photos, setPhotos] = useState([]);
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    let alive = true;
    setPhotos([]);
    if (!venueId) return undefined;
    apiRef.current
      .sb(`/rest/v1/venue_images?venue_id=eq.${encodeURIComponent(venueId)}&select=id,image_url&order=sort_order.asc`)
      .then((rows) => alive && setPhotos((rows || []).filter((r) => r.image_url)))
      .catch(() => alive && setPhotos([]));
    return () => { alive = false; };
  }, [venueId]);
  if (photos.length === 0) return null;
  return <PhotoSlider key={venueId} photos={photos} className="border-t border-white/10" />;
}
