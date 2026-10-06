'use client'

import { useEffect } from 'react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[finance/dashboard error]', error)
  }, [error])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <h2 className="text-red-700 font-bold text-lg mb-2">⚠️ 클라이언트 에러 발생</h2>
        <p className="text-red-600 text-sm font-mono bg-red-100 rounded p-3 mb-3 break-all whitespace-pre-wrap">
          {error?.message || '알 수 없는 에러'}
        </p>
        {error?.stack && (
          <details className="mb-3">
            <summary className="text-red-500 text-xs cursor-pointer">스택 트레이스 보기</summary>
            <pre className="text-red-400 text-xs mt-2 overflow-auto bg-red-50 p-2 rounded">
              {error.stack}
            </pre>
          </details>
        )}
        {error?.digest && (
          <p className="text-red-400 text-xs mb-3">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg active:opacity-70"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
