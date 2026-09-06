/**
 * Filters and their join, kept in the URL.
 *
 * They live there so a filtered view can be linked and reopened - an FK deep
 * link already worked that way while a hand-built filter did not.
 */

import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FILTERS_PARAM,
  JOIN_PARAM,
  decodeFilters,
  decodeJoin,
  encodeFilters,
  filterParamsKey,
  readFilterParamsKey
} from '../lib/filter-params'
import type { FilterJoin, RowFilter } from '@renderer/types'

interface FilterParamsOptions {
  /** Run when filters arrive from outside, so the caller can go back to page 1. */
  onAdopt: () => void
}

export function useFilterParams({ onAdopt }: FilterParamsOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const fkColumn = searchParams.get('fkColumn')
  const fkValue = searchParams.get('fkValue')

  // Filters live in the URL so a filtered view can be linked and reopened -
  // an FK deep link already worked that way while a hand-built filter did not.
  const [filters, setFiltersState] = React.useState<RowFilter[]>(() => {
    const fromUrl = decodeFilters(searchParams.get(FILTERS_PARAM))
    if (fromUrl.length > 0) return fromUrl
    if (fkColumn && fkValue != null) {
      return [{ column: fkColumn, operator: '=', value: fkValue }]
    }
    return []
  })
  const [filterJoin, setFilterJoinState] = React.useState<FilterJoin>(() =>
    decodeJoin(searchParams.get(JOIN_PARAM))
  )

  // The last params this component put in the URL. Anything else appearing
  // there arrived from outside - a value-search hit, an FK jump, the back
  // button - and has to be adopted. Comparing against our own last write rather
  // than against current state avoids fighting the render where one has updated
  // and the other has not.
  const lastWrittenParamsRef = React.useRef(readFilterParamsKey(searchParams))

  const writeFilterParams = React.useCallback(
    (next: RowFilter[], join: FilterJoin) => {
      lastWrittenParamsRef.current = filterParamsKey(next, join)
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          const encoded = encodeFilters(next)
          if (encoded) params.set(FILTERS_PARAM, encoded)
          else params.delete(FILTERS_PARAM)
          if (join === 'or' && next.length > 1) params.set(JOIN_PARAM, join)
          else params.delete(JOIN_PARAM)
          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const setFilters = React.useCallback(
    (next: RowFilter[]) => {
      setFiltersState(next)
      writeFilterParams(next, filterJoin)
    },
    [filterJoin, writeFilterParams]
  )

  const setFilterJoin = React.useCallback(
    (join: FilterJoin) => {
      setFilterJoinState(join)
      writeFilterParams(filters, join)
    },
    [filters, writeFilterParams]
  )

  /**
   * Adopt filters that arrived in the URL from somewhere else.
   *
   * `filters` is seeded from the URL by a lazy initialiser, which runs once. The
   * container keys this component by `schema.table`, so landing on a table you
   * are *already* looking at - which is what a value-search hit on the open
   * table does - never remounts it, and the new filters were simply ignored.
   */
  React.useEffect(() => {
    const key = readFilterParamsKey(searchParams)
    if (key === lastWrittenParamsRef.current) return
    lastWrittenParamsRef.current = key
    setFiltersState(decodeFilters(searchParams.get(FILTERS_PARAM)))
    setFilterJoinState(decodeJoin(searchParams.get(JOIN_PARAM)))
    // Page 1: the row that matched is unlikely to be at the old offset.
    onAdopt()
  }, [searchParams, onAdopt])

  return {
    searchParams,
    fkColumn,
    fkValue,
    filters,
    filterJoin,
    setFilters,
    setFilterJoin,
    setFiltersState,
    setFilterJoinState,
    writeFilterParams
  }
}
