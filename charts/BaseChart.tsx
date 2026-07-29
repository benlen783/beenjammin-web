"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";

import { beenJamminChartTheme } from "@/charts/theme";

type BaseChartProps = {
  option: echarts.EChartsOption;
  className?: string;
  ariaLabel: string;
};

export function BaseChart({ option, className, ariaLabel }: BaseChartProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let chart: echarts.ECharts | null = null;

    const renderAtAvailableSize = () => {
      if (!element.clientWidth || !element.clientHeight) return;

      if (!chart) {
        chart = echarts.init(element, beenJamminChartTheme, {
          renderer: "canvas",
        });
        const tooltip =
          option.tooltip && !Array.isArray(option.tooltip)
            ? { ...option.tooltip, renderMode: "richText" as const }
            : option.tooltip;
        chart.setOption({ ...option, tooltip }, { notMerge: true });
        return;
      }

      chart.resize();
    };

    const resizeObserver = new ResizeObserver(renderAtAvailableSize);
    resizeObserver.observe(element);
    const animationFrame = window.requestAnimationFrame(renderAtAvailableSize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      chart?.dispose();
    };
  }, [option]);

  return (
    <div
      ref={elementRef}
      className={className ?? "chart-canvas"}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
