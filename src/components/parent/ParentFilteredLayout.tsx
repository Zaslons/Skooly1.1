"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import ParentChildFilterBar, { type ParentChildFilterOption } from "./ParentChildFilterBar";
import { cn } from "@/lib/utils";

/** Must match `data-student-filter-id` on filterable section roots. */
const DATA_FILTER_ID = "data-student-filter-id" as const;

type Props = {
  filterOptions: ParentChildFilterOption[];
  allLabel?: string;
  /** Applied to the wrapper around filterable children (e.g. grid layout). */
  contentClassName?: string;
  /** Each filterable block must be a single root element with `data-student-filter-id={studentId}`. */
  children: ReactNode;
  className?: string;
};

/**
 * Shows the child filter when there are 2+ options; toggles visibility of wrapped sections (keeps content mounted).
 */
export default function ParentFilteredLayout({
  filterOptions,
  allLabel,
  contentClassName,
  children,
  className,
}: Props) {
  const [selected, setSelected] = useState<"all" | string>("all");

  const showBar = filterOptions.length > 1;

  const enhanced = useMemo(() => {
    if (!showBar) {
      return children;
    }
    return Children.map(children, (child) => {
      if (!isValidElement(child)) {
        return child;
      }
      const el = child as ReactElement<{ className?: string } & Record<string, unknown>>;
      const id = el.props[DATA_FILTER_ID] as string | undefined;
      if (id == null) {
        return child;
      }
      const visible = selected === "all" || selected === id;
      return cloneElement(el, {
        className: cn(el.props.className, !visible && "hidden"),
      });
    });
  }, [children, selected, showBar]);

  if (!showBar) {
    return (
      <div className={cn(className, contentClassName)}>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <ParentChildFilterBar
        className="mb-4"
        options={filterOptions}
        selected={selected}
        onSelect={setSelected}
        allLabel={allLabel}
      />
      <div className={contentClassName}>{enhanced}</div>
    </div>
  );
}
