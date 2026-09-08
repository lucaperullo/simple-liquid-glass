import React from 'react';
import { MaterialFilterContents } from '../vendor/samasante/MaterialFilter';
import type { LiquidQuality } from '../quality';

interface Props {
  filterId: string;
  liquidStage?: React.ReactNode;
  neutralMap?: boolean;
  specular?: number;
  width?: number;
  height?: number;
  displacementDataUri: string;
  resolvedQuality: LiquidQuality;
  feBlurStdDev: number;
  config: { scale: number; dispersion: number; aberrationIntensity: number; x: 'R'; y: 'B' };
}

export function DisplacementFilter({ liquidStage, filterId, displacementDataUri, resolvedQuality, feBlurStdDev, config, neutralMap = false, specular = 1, width = 0, height = 0 }: Props) {
  const sized = width > 0 && height > 0;
  const padding = Math.ceil((Math.abs(config.scale) + Math.abs(config.dispersion * config.aberrationIntensity)) / 2 + feBlurStdDev * 3 + 2);
  if (neutralMap) return <svg className="liquid-glass-filter" aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
    <defs><filter id={filterId} filterUnits="userSpaceOnUse" x={-padding-28} y={-padding-28}
      width={width+2*(padding+28)} height={height+2*(padding+28)} colorInterpolationFilters="sRGB">
      <MaterialFilterContents dispScale={config.scale} dispersion={resolvedQuality === 'low' ? 0 : config.dispersion * config.aberrationIntensity}
        specular={specular} hasSpecular={true} mapMatrix={null} width={width} height={height} mapUrl={displacementDataUri} feImageRef={null} />
      {liquidStage && <><feOffset dx="0" dy="0" result="lqBase" />{liquidStage}</>}
    </filter></defs>
  </svg>;
  return (
        <svg
          className="liquid-glass-filter"
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            position: "absolute",
            inset: 0
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id={filterId}
              filterUnits={sized ? 'userSpaceOnUse' : undefined}
              x={sized ? -padding : undefined} y={sized ? -padding : undefined}
              width={sized ? width + padding * 2 : undefined} height={sized ? height + padding * 2 : undefined}
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodColor="rgb(128,128,128)" result="neutral" />
              <feImage
                href={displacementDataUri}
                x="0"
                y="0"
                width={sized ? width : "100%"}
                height={sized ? height : "100%"}
                preserveAspectRatio="none"
                result="image"
              />
              <feComposite in="image" in2="neutral" operator="over" result={neutralMap ? "rawMap" : "map"} />
              {neutralMap && <feComponentTransfer in="rawMap" result="map">
                <feFuncR type="linear" slope="1" intercept={-1 / 510} />
                <feFuncB type="linear" slope="1" intercept={-1 / 510} />
              </feComponentTransfer>}
              {resolvedQuality === 'low' || config.dispersion * config.aberrationIntensity === 0 ? (
                <>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={config.scale}
                    xChannelSelector={config.x}
                    yChannelSelector={config.y}
                    result="output"
                  />
                  {feBlurStdDev > 0 && <feGaussianBlur in="output" stdDeviation={feBlurStdDev} />}
                </>
              ) : (
                <>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={config.scale + config.dispersion * config.aberrationIntensity}
                    xChannelSelector={config.x}
                    yChannelSelector={config.y}
                    result="dispRed"
                  />
                  <feColorMatrix
                    in="dispRed"
                    type="matrix"
                    values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                    result="red"
                  />

                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={config.scale}
                    xChannelSelector={config.x}
                    yChannelSelector={config.y}
                    result="dispGreen"
                  />
                  <feColorMatrix
                    in="dispGreen"
                    type="matrix"
                    values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
                    result="green"
                  />

                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={config.scale - config.dispersion * config.aberrationIntensity}
                    xChannelSelector={config.x}
                    yChannelSelector={config.y}
                    result="dispBlue"
                  />
                  <feColorMatrix
                    in="dispBlue"
                    type="matrix"
                    values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
                    result="blue"
                  />

                  <feBlend
                    in="red"
                    in2="green"
                    mode="screen"
                    result="rg"
                  />
                  <feBlend
                    in="rg"
                    in2="blue"
                    mode="screen"
                    result="output"
                  />
                  {feBlurStdDev > 0 && <feGaussianBlur in="output" stdDeviation={feBlurStdDev} />}
                </>
              )}
              {liquidStage && <><feOffset dx="0" dy="0" result="lqBase" />{liquidStage}</>}
            </filter>
          </defs>
        </svg>
  );
}
