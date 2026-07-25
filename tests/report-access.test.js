import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canProfileViewReport,
  createReportAccessToken,
  getReportDefinition,
  verifyReportAccessToken,
} from '../api/_report-access.js'

const BARCODE_REPORTS = ['RAR00032', 'RAR00033', 'RAR00034']

test('only the configured report codes are accepted', () => {
  for (const reportCode of BARCODE_REPORTS) {
    assert.equal(getReportDefinition(reportCode)?.requiresBarcode, true)
  }

  assert.equal(getReportDefinition('RAR00035')?.requiresBarcode, false)
  assert.deepEqual(
    {
      requiresBarcode: getReportDefinition('RAR00036')?.requiresBarcode,
      requiresDateRange: getReportDefinition('RAR00036')?.requiresDateRange,
      requiresCustomer: getReportDefinition('RAR00036')?.requiresCustomer,
    },
    {
      requiresBarcode: false,
      requiresDateRange: true,
      requiresCustomer: true,
    }
  )
  assert.equal(getReportDefinition('RAR00037')?.requiresBarcode, false)
  assert.equal(getReportDefinition('RAR00031'), null)
  assert.equal(getReportDefinition('RAR00038'), null)
})

test('existing report permissions remain enforced', () => {
  const regularProfile = {
    role: 'user',
    can_view_fixing_report: false,
    can_view_shipment_report: true,
    can_view_yarn_stock_report: false,
  }

  assert.equal(canProfileViewReport(regularProfile, 'RAR00032'), true)
  assert.equal(canProfileViewReport(regularProfile, 'RAR00035'), false)
  assert.equal(canProfileViewReport(regularProfile, 'RAR00036'), true)
  assert.equal(canProfileViewReport(regularProfile, 'RAR00037'), false)
  assert.equal(canProfileViewReport(regularProfile, 'RAR99999'), false)
  assert.equal(canProfileViewReport({ role: 'admin' }, 'RAR99999'), false)
  assert.equal(canProfileViewReport({ role: 'admin' }, 'RAR00037'), true)
})

test('access tokens cannot be created or verified for unknown reports', () => {
  assert.throws(
    () => createReportAccessToken({
      userId: 'user-1',
      reportCode: 'RAR99999',
      pdfUrl: 'https://example.com/report.pdf',
    }),
    /Desteklenmeyen rapor kodu/
  )

  assert.equal(
    verifyReportAccessToken('invalid.token', {
      userId: 'user-1',
      reportCode: 'RAR99999',
      pdfUrl: 'https://example.com/report.pdf',
    }),
    false
  )
})
