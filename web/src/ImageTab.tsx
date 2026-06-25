import React, { useState } from 'react';
import type { ImageView } from './protocol';

// An image view tab body: a compact metadata header (name, size, location) above the image, which
// fills the remaining space. Orientation is intrinsic to the image and read once it loads: a
// landscape image (wider than tall) spans the full width; a portrait image fills the full remaining
// height beneath the header. CSS keeps either fit responsive to tab resizes.
export function ImageTab({ image }: { image: ImageView }) {
  const [orientation, setOrientation] = useState<'image-landscape' | 'image-portrait'>('image-landscape');
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const src = `${image.url}?token=${encodeURIComponent(token)}`;

  return (
    <div className="image-tab">
      <div className="image-meta">
        <span className="image-name">{image.name}</span>
        <span className="image-size">{image.size}</span>
        <span className="image-loc">{image.path}</span>
      </div>
      <div className="image-stage">
        <img
          className={orientation}
          src={src}
          alt={image.name}
          onLoad={(e) => {
            const img = e.currentTarget;
            setOrientation(img.naturalWidth > img.naturalHeight ? 'image-landscape' : 'image-portrait');
          }}
        />
      </div>
    </div>
  );
}
