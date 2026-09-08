/*! Copyright (c) 2026 Sam Asante. MIT; see THIRD_PARTY_NOTICES.md. */
import React from 'react';
import { DISPERSION_SPREAD } from './displacement';
export const MaterialFilterContents: React.FC<{
  /** Displacement scale in px (already obb-normalized: strength × diagonal). */
  dispScale: number;
  dispersion: number;
  /** B-channel specular gain (sheen + glow); 0 → skip the specular pass. */
  specular: number;
  hasSpecular: boolean;
  /** Per-axis map rescale around 0.5 (anisotropic lenses); null → none. */
  mapMatrix: string | null;
  width: number;
  height: number;
  mapUrl: string;
  feImageRef: React.Ref<SVGFEImageElement>;
}> = ({
  dispScale,
  dispersion,
  specular,
  hasSpecular,
  mapMatrix,
  width,
  height,
  mapUrl,
  feImageRef,
}) => {
  const mapInput = mapMatrix ? "scaledMap" : "map";
  return (
    <>
      {/* Back the map with neutral grey (displacement 0) across the whole, margin-
          extended region: the feImage only covers the box, so without this the map
          is transparent-black outside it and the displacement resampling biases the
          box edge toward a dark/contorted fringe. Mirrors LensFilterContents. */}
      <feFlood floodColor="rgb(128,128,128)" floodOpacity="1" result="mapBg" />
      <feImage
        ref={feImageRef}
        href={mapUrl || undefined}
        x={0}
        y={0}
        width={width}
        height={height}
        preserveAspectRatio="none"
        result="rawMap"
      />
      <feComposite in="rawMap" in2="mapBg" operator="over" result="map" />
      {mapMatrix && (
        <feColorMatrix
          in="map"
          type="matrix"
          values={mapMatrix}
          result="scaledMap"
        />
      )}
      {dispersion > 0 ? (
        <>
          <feDisplacementMap
            in="SourceGraphic"
            in2={mapInput}
            scale={dispScale * (1 + DISPERSION_SPREAD * dispersion)}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="refractR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2={mapInput}
            scale={dispScale * (1 + DISPERSION_SPREAD * 0.5 * dispersion)}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="refractG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2={mapInput}
            scale={dispScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="refractB"
          />
          <feComposite
            in="refractR"
            in2="refractG"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="refractRG"
          />
          <feComposite
            in="refractRG"
            in2="refractB"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="lensOut"
          />
        </>
      ) : (
        <feDisplacementMap
          in="SourceGraphic"
          in2={mapInput}
          scale={dispScale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="lensOut"
        />
      )}
      {hasSpecular && (
        <>
          {/* Lift the map's B channel into a bright sheen mask (128→0, 255→1),
              then add it over the refracted backdrop — the directional rim shine
              + soft inner glow, the same specular the rest of the library uses. */}
          <feColorMatrix
            in="map"
            type="matrix"
            values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`}
            result="sheenMask"
          />
          <feComposite
            in="sheenMask"
            in2="lensOut"
            operator="arithmetic"
            k1="0"
            k2={specular}
            k3="1"
            k4="0"
          />
        </>
      )}
    </>
  );
};
