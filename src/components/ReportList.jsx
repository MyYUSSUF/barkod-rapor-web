import { Fragment } from 'react'

const REPORT_ICON_PATHS = {
  inspect: (
    <>
      <path d="M8 4h8l3 3v13H5V4h3z" />
      <path d="M15 4v4h4" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  work: (
    <>
      <path d="M9 7V5h6v2" />
      <path d="M4 8h16v11H4V8z" />
      <path d="M4 13h16" />
      <path d="M10 13v2h4v-2" />
    </>
  ),
  surface: (
    <>
      <path d="M4 16l5-8 4 5 3-4 4 7" />
      <path d="M4 19h16" />
      <path d="M7 12h2" />
      <path d="M14 12h2" />
    </>
  ),
  fixing: (
    <>
      <path d="M6 7h12" />
      <path d="M8 7v10" />
      <path d="M16 7v10" />
      <path d="M7 17h10" />
      <path d="M10 10h4" />
    </>
  ),
  shipment: (
    <>
      <path d="M3 8h11v8H3V8z" />
      <path d="M14 11h4l3 3v2h-7v-5z" />
      <path d="M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path d="M17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </>
  ),
  stock: (
    <>
      <path d="M5 8c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z" />
      <path d="M5 8v8c0 1.7 3.1 3 7 3s7-1.3 7-3V8" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      <path d="M9 8h6" />
    </>
  ),
}

function ReportIcon({ type }) {
  return (
    <svg
      className="reportButtonIcon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      >
        {REPORT_ICON_PATHS[type] || REPORT_ICON_PATHS.inspect}
      </g>
    </svg>
  )
}

function ShipmentFields({
  report,
  loading,
  shipment,
  onOpenReport,
}) {
  const {
    customers,
    customerCode,
    dateBoxRef,
    customerSelectRef,
    startInputRef,
    startDate,
    endDate,
    dayCount,
    formatDate,
    texts,
    onCustomerChange,
    onStartDateChange,
    onEndDateChange,
  } = shipment
  const selectedCustomer = customers.find(
    (customer) => customer.code === customerCode
  )

  return (
    <div className="dateRangeBox" ref={dateBoxRef}>
      <div className="shipmentCustomerField">
        <label htmlFor="shipmentCustomer">{texts.customer}</label>
        <select
          id="shipmentCustomer"
          ref={customerSelectRef}
          value={customerCode}
          onChange={(event) => onCustomerChange(event.target.value)}
          disabled={loading}
        >
          <option value="">{texts.selectCustomer}</option>
          {customers.map((customer) => (
            <option key={customer.code} value={customer.code}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="dateInputGrid">
        <div className="shipmentStartField">
          <label htmlFor="shipmentStartDate">{texts.startDate}</label>
          <input
            id="shipmentStartDate"
            ref={startInputRef}
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            disabled={loading}
          />
        </div>

        <div className="shipmentEndField">
          <label htmlFor="shipmentEndDate">{texts.endDate}</label>
          <input
            id="shipmentEndDate"
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            disabled={loading}
          />
        </div>

        <div className="shipmentOpenField">
          <button
            type="button"
            className="shipmentOpenButton"
            onClick={() => onOpenReport(report)}
            disabled={loading}
          >
            {texts.openReport}
          </button>
        </div>
      </div>

      {startDate && endDate && (
        <div className="dateRangeFooter">
          <div className="dateRangeSummary">
            <strong>{texts.selectedDateRange}</strong>
            <span>
              {formatDate(startDate)} - {formatDate(endDate)}
              {dayCount && (
                <> · {dayCount} {texts.selectedDayCount}</>
              )}
            </span>
            {selectedCustomer && (
              <>
                <strong className="shipmentCustomerSummaryLabel">
                  {texts.selectedCustomer}
                </strong>
                <span>{selectedCustomer.name}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ReportList({
  reports,
  loading,
  selectedReportCode,
  dateRangeReportCode,
  shipment,
  getReportName,
  getReportMeta,
  onReportClick,
  onOpenReport,
}) {
  return (
    <div className="reportButtons">
      {reports.map((report, index) => {
        const isPreparing =
          loading && selectedReportCode === report.code

        return (
          <Fragment key={report.code}>
            <button
              type="button"
              className={`mainButton reportButton reportButton${index + 1}${
                isPreparing ? ' reportButtonLoading' : ''
              }`}
              onClick={() => onReportClick(report)}
              disabled={loading}
            >
              <span className="reportButtonMark">
                <ReportIcon type={report.icon} />
              </span>

              <span className="reportButtonBody">
                <strong>
                  {isPreparing
                    ? `${getReportName(report)} ${shipment.texts.reportPreparing}`
                    : getReportName(report)}
                </strong>
                <small>{getReportMeta(report)}</small>
              </span>

              {isPreparing && <span className="reportButtonProgressBar"></span>}
            </button>

            {report.requiresDateRange &&
              dateRangeReportCode === report.code && (
                <ShipmentFields
                  report={report}
                  loading={loading}
                  shipment={shipment}
                  onOpenReport={onOpenReport}
                />
              )}
          </Fragment>
        )
      })}
    </div>
  )
}
