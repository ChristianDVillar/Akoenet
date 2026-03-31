import GlobalSearchModal from './GlobalSearchModal'

export default function AppChrome({ children }) {
  return (
    <>
      <GlobalSearchModal />
      {children}
    </>
  )
}
