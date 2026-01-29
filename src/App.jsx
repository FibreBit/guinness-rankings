import { useState, useEffect, Fragment } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

function App() {
  const [pubData, setPubData] = useState([])
  const [alumniData, setAlumniData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('leaderboard')
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [expandedRow, setExpandedRow] = useState(null)
  const [selectedPub, setSelectedPub] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/rankings.xlsx')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })

        const pubSheet = workbook.Sheets['Pub Ratings']
        const pubJson = XLSX.utils.sheet_to_json(pubSheet)
        setPubData(pubJson)

        const alumniSheet = workbook.Sheets['Alumni Stats']
        const alumniJson = XLSX.utils.sheet_to_json(alumniSheet)
        setAlumniData(alumniJson)

        setLoading(false)
      } catch (err) {
        console.error('Fetch error:', err)
        setError(`Failed to load: ${err.message}`)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const locations = [...new Set(pubData.map(pub => pub.Location).filter(Boolean))].sort()

  const getFilteredPubs = () => {
    let filtered = [...pubData]

    if (searchTerm) {
      filtered = filtered.filter(pub =>
        pub['Pub Name']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pub.Location?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (locationFilter !== 'all') {
      filtered = filtered.filter(pub => pub.Location === locationFilter)
    }

    filtered.sort((a, b) => (b['Overall Score'] || 0) - (a['Overall Score'] || 0))

    return filtered
  }

  const filteredPubs = getFilteredPubs()

  const formatDate = (excelDate) => {
    if (!excelDate || excelDate === 'Unknown') return 'Unknown'
    if (typeof excelDate === 'string') return excelDate
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getRankClass = (rank) => {
    if (rank === 1) return 'rank-gold'
    if (rank === 2) return 'rank-silver'
    if (rank === 3) return 'rank-bronze'
    return ''
  }

  if (loading) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', color: '#000', backgroundColor: '#FEFDF5', minHeight: '100vh' }}>
        <h1>Loading rankings...</h1>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', color: 'red', backgroundColor: '#FEFDF5', minHeight: '100vh' }}>
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Guinness <span className="accent">Rankings</span></h1>
        <p className="subtitle">Track, rate, and compare Dublin's finest pints</p>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          Leaderboard
        </button>
        <button
          className={`tab ${activeTab === 'alumni' ? 'active' : ''}`}
          onClick={() => setActiveTab('alumni')}
        >
          Alumni Stats
        </button>
      </nav>

      {activeTab === 'leaderboard' && (
        <div>
          <div className="controls">
            <input
              type="text"
              placeholder="Search pubs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Locations</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <span className="result-count">{filteredPubs.length} pubs</span>
          </div>

          <div className="table-container">
            <table className="rankings-table">
              <thead>
                <tr>
                  <th className="col-rank">Rank</th>
                  <th className="col-name">Pub Name</th>
                  <th className="col-location">Location</th>
                  <th className="col-score">Score</th>
                  <th className="col-price">Price</th>
                  <th className="col-expand"></th>
                </tr>
              </thead>
              <tbody>
                {filteredPubs.map((pub, index) => {
                  const rank = index + 1
                  const isExpanded = expandedRow === index
                  return (
                    <Fragment key={index}>
                      <tr
                        className={`${getRankClass(rank)} ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => setSelectedPub(pub)}
                      >
                        <td className="col-rank">
                          <span className={`rank-badge ${getRankClass(rank)}`}>{rank}</span>
                        </td>
                        <td className="col-name">{pub['Pub Name']}</td>
                        <td className="col-location">{pub.Location}</td>
                        <td className="col-score">
                          <span className="score-badge">{typeof pub['Overall Score'] === 'number' ? pub['Overall Score'].toFixed(2) : 'N/A'}</span>
                        </td>
                        <td className="col-price">€{typeof pub.Price === 'number' ? pub.Price.toFixed(2) : pub.Price || 'N/A'}</td>
                        <td className="col-expand">
                          <button
                            className="expand-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedRow(isExpanded ? null : index)
                            }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="expanded-row">
                          <td colSpan="6">
                            <div className="expanded-content">
                              <div className="category-scores">
                                <div className="category">
                                  <span className="category-label">Taste</span>
                                  <span className="category-value">{typeof pub.Taste === 'number' ? pub.Taste.toFixed(1) : 'N/A'}</span>
                                </div>
                                <div className="category">
                                  <span className="category-label">Texture</span>
                                  <span className="category-value">{typeof pub.Texture === 'number' ? pub.Texture.toFixed(1) : 'N/A'}</span>
                                </div>
                                <div className="category">
                                  <span className="category-label">Stickage</span>
                                  <span className="category-value">{typeof pub['Stickage '] === 'number' ? pub['Stickage '].toFixed(1) : 'N/A'}</span>
                                </div>
                                <div className="category">
                                  <span className="category-label">Head:Body</span>
                                  <span className="category-value">{typeof pub['Head to Body Ratio'] === 'number' ? pub['Head to Body Ratio'].toFixed(1) : 'N/A'}</span>
                                </div>
                                <div className="category">
                                  <span className="category-label">Pub Character</span>
                                  <span className="category-value">{typeof pub['Pub Character'] === 'number' ? pub['Pub Character'].toFixed(1) : 'N/A'}</span>
                                </div>
                              </div>
                              <div className="expanded-meta">
                                <p><strong>Date:</strong> {formatDate(pub['Date of Visit'])}</p>
                                <p><strong>Alumni:</strong> {pub['Alumni Present']}</p>
                                {pub.Comments && <p><strong>Comments:</strong> {pub.Comments}</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredPubs.length === 0 && (
            <div className="no-results">No pubs found matching your search.</div>
          )}
        </div>
      )}

      {activeTab === 'alumni' && (
        <div>
          <div className="alumni-header">
            <h2>Alumni Leaderboard</h2>
            <p className="alumni-subtitle">The dedicated Guinness researchers</p>
          </div>

          {/* Stats Cards */}
          {alumniData.length > 0 && (() => {
            const validAlumni = alumniData.filter(a => typeof a['Average Pub Score'] === 'number')
            const harshest = [...validAlumni].sort((a, b) => a['Average Pub Score'] - b['Average Pub Score'])[0]
            const kindest = [...validAlumni].sort((a, b) => b['Average Pub Score'] - a['Average Pub Score'])[0]
            const mostDedicated = [...alumniData].filter(a => typeof a['Attendance Record'] === 'number').sort((a, b) => b['Attendance Record'] - a['Attendance Record'])[0]
            const bigSpender = [...alumniData].filter(a => typeof a['Money Invested'] === 'number').sort((a, b) => b['Money Invested'] - a['Money Invested'])[0]
            const veteran = [...alumniData].filter(a => typeof a['Pubs Visited'] === 'number').sort((a, b) => b['Pubs Visited'] - a['Pubs Visited'])[0]

            // Count appearances from pub data
            const appearanceCounts = {}
            pubData.forEach(pub => {
              const present = pub['Alumni Present']
              if (present) {
                present.split(',').forEach(name => {
                  const trimmed = name.trim()
                  if (trimmed) {
                    appearanceCounts[trimmed] = (appearanceCounts[trimmed] || 0) + 1
                  }
                })
              }
            })
            const topAppearances = Object.entries(appearanceCounts).sort((a, b) => b[1] - a[1])[0]

            return (
              <div className="stats-cards">
                <div className="stat-card">
                  <span className="stat-icon">😈</span>
                  <span className="stat-label">Harshest Rater</span>
                  <span className="stat-value">{harshest?.Alumni}</span>
                  <span className="stat-detail">Avg: {harshest?.['Average Pub Score']?.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">😇</span>
                  <span className="stat-label">Kindest Rater</span>
                  <span className="stat-value">{kindest?.Alumni}</span>
                  <span className="stat-detail">Avg: {kindest?.['Average Pub Score']?.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">🎯</span>
                  <span className="stat-label">Most Dedicated</span>
                  <span className="stat-value">{mostDedicated?.Alumni}</span>
                  <span className="stat-detail">{(mostDedicated?.['Attendance Record'] * 100)?.toFixed(0)}% attendance</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">💸</span>
                  <span className="stat-label">Big Spender</span>
                  <span className="stat-value">{bigSpender?.Alumni}</span>
                  <span className="stat-detail">€{bigSpender?.['Money Invested']?.toFixed(0)} invested</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">🏆</span>
                  <span className="stat-label">Most Appearances</span>
                  <span className="stat-value">{topAppearances?.[0]}</span>
                  <span className="stat-detail">{topAppearances?.[1]} pub visits</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">🍺</span>
                  <span className="stat-label">Veteran</span>
                  <span className="stat-value">{veteran?.Alumni}</span>
                  <span className="stat-detail">{veteran?.['Pubs Visited']} pubs rated</span>
                </div>
              </div>
            )
          })()}

          <div className="table-container">
            <table className="rankings-table alumni-table">
              <thead>
                <tr>
                  <th className="col-rank">Rank</th>
                  <th>Alumni</th>
                  <th>Pubs Visited</th>
                  <th>Avg Score</th>
                  <th>Attendance</th>
                  <th>Invested</th>
                </tr>
              </thead>
              <tbody>
                {alumniData.map((alumni, index) => {
                  const rank = index + 1
                  return (
                    <tr key={index} className={getRankClass(rank)}>
                      <td className="col-rank">
                        <span className={`rank-badge ${getRankClass(rank)}`}>{rank}</span>
                      </td>
                      <td className="alumni-name">{alumni.Alumni}</td>
                      <td>{alumni['Pubs Visited']}</td>
                      <td>
                        <span className="score-badge">{typeof alumni['Average Pub Score'] === 'number' ? alumni['Average Pub Score'].toFixed(2) : 'N/A'}</span>
                      </td>
                      <td>{typeof alumni['Attendance Record'] === 'number' ? (alumni['Attendance Record'] * 100).toFixed(0) : 'N/A'}%</td>
                      <td className="money">€{typeof alumni['Money Invested'] === 'number' ? alumni['Money Invested'].toFixed(2) : 'N/A'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPub && (
        <div className="modal-overlay" onClick={() => setSelectedPub(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPub(null)}>×</button>

            <div className="modal-header">
              <h2>{selectedPub['Pub Name']}</h2>
              <span className="modal-location">{selectedPub.Location}</span>
            </div>

            <div className="modal-score">
              <span className="modal-score-value">{typeof selectedPub['Overall Score'] === 'number' ? selectedPub['Overall Score'].toFixed(2) : 'N/A'}</span>
              <span className="modal-score-label">Overall Score</span>
            </div>

            <div className="modal-categories">
              {[
                { key: 'Taste', label: 'Taste' },
                { key: 'Texture', label: 'Texture' },
                { key: 'Stickage ', label: 'Stickage' },
                { key: 'Head to Body Ratio', label: 'Head:Body Ratio' },
                { key: 'Pub Character', label: 'Pub Character' }
              ].map(cat => (
                <div className="modal-category" key={cat.key}>
                  <div className="modal-category-bar">
                    <div
                      className="modal-category-fill"
                      style={{ width: `${((selectedPub[cat.key] || 0) / 10) * 100}%` }}
                    />
                  </div>
                  <span className="modal-category-label">{cat.label}</span>
                  <span className="modal-category-value">{typeof selectedPub[cat.key] === 'number' ? selectedPub[cat.key].toFixed(1) : 'N/A'}</span>
                </div>
              ))}
            </div>

            <div className="modal-details">
              <div className="modal-detail">
                <span className="modal-detail-label">Price</span>
                <span className="modal-detail-value">€{typeof selectedPub.Price === 'number' ? selectedPub.Price.toFixed(2) : selectedPub.Price || 'N/A'}</span>
              </div>
              <div className="modal-detail">
                <span className="modal-detail-label">Date Visited</span>
                <span className="modal-detail-value">{formatDate(selectedPub['Date of Visit'])}</span>
              </div>
            </div>

            <div className="modal-alumni">
              <span className="modal-detail-label">Alumni Present</span>
              <div className="alumni-chips">
                {selectedPub['Alumni Present']?.split(',').map((name, i) => (
                  <span key={i} className="alumni-chip">{name.trim()}</span>
                ))}
              </div>
            </div>

            {selectedPub.Comments && (
              <div className="modal-comments">
                <span className="modal-detail-label">Comments</span>
                <p>{selectedPub.Comments}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
