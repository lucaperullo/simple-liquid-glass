/*! Copyright (c) 2026 Sam Asante. MIT; see THIRD_PARTY_NOTICES.md. */
import React from 'react';
import { materialFilterStages, type MaterialFilterOptions } from '../../core/materialFilter';
export const MaterialFilterContents: React.FC<MaterialFilterOptions & { feImageRef: React.Ref<SVGFEImageElement> }> = ({feImageRef,...options}) => <>
  {materialFilterStages(options).map(({tag,attrs},key)=>React.createElement(tag,{...attrs,key,...(tag==='feImage'?{ref:feImageRef}:null)}))}
</>;
