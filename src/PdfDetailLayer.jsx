import { useEffect, useLayoutEffect, useRef } from 'react'

const RETRY_SCALE = 0.75

function releaseCanvas(canvas) {
  if (!canvas) {
    return
  }

  canvas.style.visibility = 'hidden'
  canvas.width = 0
  canvas.height = 0
}

function positionCanvas(canvas, detail, pageWidth) {
  if (!canvas || !detail || detail.pageWidth <= 0) {
    return
  }

  const ratio = pageWidth / detail.pageWidth

  canvas.style.left = `${detail.left * ratio}px`
  canvas.style.top = `${detail.top * ratio}px`
  canvas.style.width = `${detail.width * ratio}px`
  canvas.style.height = `${detail.height * ratio}px`
}

function isCancelled(error) {
  return (
    error?.name === 'RenderingCancelledException' ||
    error?.name === 'AbortException'
  )
}

function PdfDetailLayer({
  detailRequest,
  pageWidth,
  shouldKeep,
}) {
  // Yeni detay hazırlanırken diğer canvas eski görüntüyü ekranda tutar.
  const firstCanvasRef = useRef(null)
  const secondCanvasRef = useRef(null)
  const activeIndexRef = useRef(-1)
  const activeDetailRef = useRef(null)
  const pendingIndexRef = useRef(-1)
  const renderTaskRef = useRef(null)
  const generationRef = useRef(0)
  const latestPageWidthRef = useRef(pageWidth)

  const getCanvas = (index) =>
    index === 0 ? firstCanvasRef.current : secondCanvasRef.current

  useLayoutEffect(() => {
    latestPageWidthRef.current = pageWidth

    const activeCanvas = getCanvas(activeIndexRef.current)

    positionCanvas(
      activeCanvas,
      activeDetailRef.current,
      pageWidth
    )
  }, [pageWidth])

  useEffect(() => {
    if (shouldKeep) {
      return
    }

    generationRef.current += 1
    renderTaskRef.current?.cancel()
    renderTaskRef.current = null
    pendingIndexRef.current = -1
    activeIndexRef.current = -1
    activeDetailRef.current = null
    releaseCanvas(firstCanvasRef.current)
    releaseCanvas(secondCanvasRef.current)
  }, [shouldKeep])

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current

    renderTaskRef.current?.cancel()
    renderTaskRef.current = null

    const previousPendingIndex = pendingIndexRef.current

    if (
      previousPendingIndex >= 0 &&
      previousPendingIndex !== activeIndexRef.current
    ) {
      releaseCanvas(getCanvas(previousPendingIndex))
    }

    pendingIndexRef.current = -1

    if (!shouldKeep || !detailRequest) {
      return undefined
    }

    const targetIndex = activeIndexRef.current === 0 ? 1 : 0
    const targetCanvas = getCanvas(targetIndex)

    if (!targetCanvas) {
      return undefined
    }

    let disposed = false
    pendingIndexRef.current = targetIndex

    // Hareket yeniden başlarsa devam eden PDF çizimi iptal edilir.
    const draw = async (outputScale, canRetry) => {
      let renderTask = null

      releaseCanvas(targetCanvas)
      positionCanvas(
        targetCanvas,
        detailRequest,
        latestPageWidthRef.current
      )

      try {
        targetCanvas.width = Math.max(
          1,
          Math.floor(detailRequest.width * outputScale)
        )
        targetCanvas.height = Math.max(
          1,
          Math.floor(detailRequest.height * outputScale)
        )

        const context = targetCanvas.getContext('2d', {
          alpha: false,
        })

        if (!context) {
          throw new Error('PDF detay alanı hazırlanamadı.')
        }

        const viewport = detailRequest.page.getViewport({
          scale: detailRequest.viewportScale,
        })
        renderTask = detailRequest.page.render({
          canvas: targetCanvas,
          canvasContext: context,
          viewport,
          transform: [
            outputScale,
            0,
            0,
            outputScale,
            -detailRequest.left * outputScale,
            -detailRequest.top * outputScale,
          ],
          background: '#ffffff',
        })

        renderTaskRef.current = renderTask
        await renderTask.promise

        if (
          disposed ||
          generationRef.current !== generation ||
          pendingIndexRef.current !== targetIndex
        ) {
          releaseCanvas(targetCanvas)
          return
        }

        positionCanvas(
          targetCanvas,
          detailRequest,
          latestPageWidthRef.current
        )
        targetCanvas.style.visibility = 'visible'

        const previousActiveIndex = activeIndexRef.current

        activeIndexRef.current = targetIndex
        activeDetailRef.current = detailRequest
        pendingIndexRef.current = -1

        if (
          previousActiveIndex >= 0 &&
          previousActiveIndex !== targetIndex
        ) {
          releaseCanvas(getCanvas(previousActiveIndex))
        }
      } catch (error) {
        if (
          disposed ||
          generationRef.current !== generation ||
          isCancelled(error)
        ) {
          return
        }

        if (canRetry) {
          await draw(outputScale * RETRY_SCALE, false)
          return
        }

        releaseCanvas(targetCanvas)
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null
        }
      }
    }

    void draw(detailRequest.outputScale, true)

    return () => {
      disposed = true

      if (generationRef.current === generation) {
        generationRef.current += 1
      }

      renderTaskRef.current?.cancel()
      renderTaskRef.current = null

      if (pendingIndexRef.current === targetIndex) {
        pendingIndexRef.current = -1

        if (activeIndexRef.current !== targetIndex) {
          releaseCanvas(targetCanvas)
        }
      }
    }
  }, [detailRequest, shouldKeep])

  useEffect(() => {
    const firstCanvas = firstCanvasRef.current
    const secondCanvas = secondCanvasRef.current

    return () => {
      generationRef.current += 1
      renderTaskRef.current?.cancel()
      releaseCanvas(firstCanvas)
      releaseCanvas(secondCanvas)
    }
  }, [])

  return (
    <div className="nativePdfDetailLayer" aria-hidden="true">
      <canvas ref={firstCanvasRef} />
      <canvas ref={secondCanvasRef} />
    </div>
  )
}

export default PdfDetailLayer
