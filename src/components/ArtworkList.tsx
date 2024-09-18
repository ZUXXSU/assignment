import { useState, useEffect, useRef } from "react"
import { DataTable, DataTablePageEvent } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Checkbox, CheckboxChangeEvent } from 'primereact/checkbox'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Toast } from 'primereact/toast'
import 'primereact/resources/themes/lara-light-indigo/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

interface Artwork {
  id: number
  title: string
  place_of_origin: string
  artist_display: string
  inscriptions: string | null
  date_start: number
  date_end: number
}

interface ApiResponse {
  data: Artwork[]
  pagination: {
    total: number
    limit: number
    offset: number
    total_pages: number
    current_page: number
  }
}

export default function ArtworkList() {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [totalRecords, setTotalRecords] = useState(0)
  const [lazyParams, setLazyParams] = useState({
    first: 0,
    rows: 12,
    page: 1,
    sortField: null as string | null,
    sortOrder: null as 1 | -1 | null,
  })
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<number[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [rowSelection, setRowSelection] = useState('')
  const [pendingSelection, setPendingSelection] = useState<number>(0)
  const op = useRef<OverlayPanel>(null)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    fetchArtworks()
    const storedSelection = localStorage.getItem('selectedArtworkIds')
    if (storedSelection) {
      setSelectedArtworkIds(JSON.parse(storedSelection))
    }
  }, [lazyParams])

  useEffect(() => {
    localStorage.setItem('selectedArtworkIds', JSON.stringify(selectedArtworkIds))
  }, [selectedArtworkIds])

  useEffect(() => {
    if (pendingSelection > 0) {
      fetchNextPage()
    }
  }, [pendingSelection, selectedArtworkIds])

  const fetchArtworks = async () => {
    setLoading(true)
    try {
      let url = `https://api.artic.edu/api/v1/artworks?page=${lazyParams.page}&limit=${lazyParams.rows}&fields=id,title,place_of_origin,artist_display,inscriptions,date_start,date_end`
      
      if (lazyParams.sortField) {
        url += `&sort_by=${lazyParams.sortField}${lazyParams.sortOrder === -1 ? ':desc' : ''}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch artworks')
      }
      const data: ApiResponse = await response.json()
      setArtworks(data.data)
      setTotalRecords(data.pagination.total)
    } catch (err) {
      console.error('An error occurred while fetching artworks:', err)
      toast.current?.show({severity: 'error', summary: 'Error', detail: 'Failed to fetch artworks', life: 3000})
    } finally {
      setLoading(false)
    }
  }

  const fetchNextPage = async () => {
    const nextPage = lazyParams.page + 1
    try {
      let url = `https://api.artic.edu/api/v1/artworks?page=${nextPage}&limit=${lazyParams.rows}&fields=id,title,place_of_origin,artist_display,inscriptions,date_start,date_end`
      
      if (lazyParams.sortField) {
        url += `&sort_by=${lazyParams.sortField}${lazyParams.sortOrder === -1 ? ':desc' : ''}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch next page of artworks')
      }
      const data: ApiResponse = await response.json()
      const newArtworks = data.data
      const remainingToSelect = Math.min(pendingSelection, newArtworks.length)
      const newSelectedIds = newArtworks.slice(0, remainingToSelect).map(artwork => artwork.id)
      
      setSelectedArtworkIds(prev => [...prev, ...newSelectedIds])
      setPendingSelection(prev => prev - remainingToSelect)
      
      if (remainingToSelect < newArtworks.length || nextPage * lazyParams.rows >= totalRecords) {
        // We've selected all we need or reached the end of the data
        setPendingSelection(0)
      } else {
        // We need to fetch more data
        setLazyParams(prev => ({ ...prev, page: nextPage }))
      }
    } catch (err) {
      console.error('An error occurred while fetching the next page:', err)
      toast.current?.show({severity: 'error', summary: 'Error', detail: 'Failed to fetch more artworks', life: 3000})
      setPendingSelection(0)
    }
  }

  const onPage = (event: DataTablePageEvent) => {
    setLazyParams(prevParams => ({
      ...prevParams,
      first: event.first,
      rows: event.rows,
      page: event.page! + 1, // API uses 1-based indexing
    }))
  }

  const onSort = (event: { sortField: string; sortOrder: 1 | -1 }) => {
    setLazyParams(prevParams => ({
      ...prevParams,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    }))
  }

  const toggleOverlay = (event: React.MouseEvent<HTMLButtonElement>) => {
    op.current?.toggle(event)
  }

  const handleSubmit = () => {
    const numRows = parseInt(rowSelection, 10)
    if (isNaN(numRows) || numRows < 0) {
      toast.current?.show({severity: 'error', summary: 'Invalid Input', detail: 'Please enter a valid number of rows to select.', life: 3000})
      return
    }

    const currentPageIds = artworks.map(artwork => artwork.id)
    const remainingSelection = selectedArtworkIds.filter(id => !currentPageIds.includes(id))
    const newSelection = [...remainingSelection, ...currentPageIds.slice(0, Math.min(numRows, currentPageIds.length))]

    setSelectedArtworkIds(newSelection)
    setPendingSelection(Math.max(0, numRows - currentPageIds.length))
    setSelectAll(newSelection.length + Math.max(0, numRows - currentPageIds.length) === totalRecords)
    op.current?.hide()

    if (numRows > currentPageIds.length) {
      toast.current?.show({severity: 'info', summary: 'Selection Pending', detail: `Selecting ${numRows} items. This may span multiple pages.`, life: 3000})
    }
  }

  const dateRangeTemplate = (rowData: Artwork) => {
    return `${rowData.date_start} - ${rowData.date_end}`
  }

  const checkboxTemplate = (rowData: Artwork) => {
    const isSelected = selectedArtworkIds.includes(rowData.id)
    return (
      <Checkbox
        onChange={(e: CheckboxChangeEvent) => {
          let newSelection: number[]
          if (e.checked) {
            newSelection = [...selectedArtworkIds, rowData.id]
          } else {
            newSelection = selectedArtworkIds.filter(id => id !== rowData.id)
          }
          setSelectedArtworkIds(newSelection)
          setSelectAll(newSelection.length === totalRecords)
        }}
        checked={isSelected}
        className="custom-checkbox"
      />
    )
  }

  const selectAllTemplate = () => {
    return (
      <div className="flex items-center">
        <Checkbox
          onChange={(e: CheckboxChangeEvent) => {
            if (e.checked) {
              const allIds = artworks.map(artwork => artwork.id)
              setSelectedArtworkIds(prevIds => {
                const newIds = new Set([...prevIds, ...allIds])
                return Array.from(newIds)
              })
            } else {
              const currentPageIds = artworks.map(artwork => artwork.id)
              setSelectedArtworkIds(prevIds => prevIds.filter(id => !currentPageIds.includes(id)))
            }
          }}
          checked={artworks.every(artwork => selectedArtworkIds.includes(artwork.id))}
          className="custom-checkbox mr-2"
        />
        <Button
          icon={op.current?.visible ? "pi pi-chevron-up" : "pi pi-chevron-down"}
          onClick={toggleOverlay}
          className="p-button-text p-button-rounded"
          aria-label="Toggle selection controls"
        />
        <OverlayPanel ref={op} showCloseIcon>
          <div className="flex flex-column gap-2">
            <InputText
              value={rowSelection}
              onChange={(e) => setRowSelection(e.target.value)}
              placeholder="Number of rows to select"
              type="number"
              min="0"
            />
            <Button onClick={handleSubmit} label="Submit" />
          </div>
        </OverlayPanel>
      </div>
    )
  }

  return (
    <div className="card">
      <Toast ref={toast} />
      <style jsx global>{`
        .custom-checkbox .p-checkbox-box {
          border: 1px solid rgba(0, 0, 0, 0.3) !important;
        }
      `}</style>
      <DataTable
        value={artworks}
        lazy
        dataKey="id"
        paginator
        first={lazyParams.first}
        rows={lazyParams.rows}
        totalRecords={totalRecords}
        onPage={onPage}
        onSort={onSort}
        sortField={lazyParams.sortField}
        sortOrder={lazyParams.sortOrder}
        loading={loading}
        emptyMessage="No artworks found."
      >
        <Column body={checkboxTemplate} header={selectAllTemplate} headerStyle={{ width: '6rem' }} />
        <Column field="title" header="Title" sortable />
        <Column field="place_of_origin" header="Origin" sortable />
        <Column field="artist_display" header="Artist" sortable />
        <Column field="inscriptions" header="Inscriptions" sortable />
        <Column field="date_start" header="Date Range" body={dateRangeTemplate} sortable />
      </DataTable>
      <div className="mt-4">
        Selected Artworks: {selectedArtworkIds.length}
        {pendingSelection > 0 && ` (${pendingSelection} pending)`}
      </div>
    </div>
  )
}