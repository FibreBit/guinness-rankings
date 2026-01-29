import { useState, useEffect, Fragment } from 'react'
import { supabase } from './supabaseClient'
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
  const [showAddRating, setShowAddRating] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    pubName: '',
    location: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
    submittedBy: '',
    taste: 7,
    texture: 7,
    stickage: 7,
    headToBody: 7,
    pubCharacter: 7,
    comments: ''
  })
  const [formSubmitted, setFormSubmitted] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch pub ratings from Supabase
        const { data: pubRatings, error: pubError } = await supabase
          .from('pub_ratings')
          .select('*')
          .order('overall_score', { ascending: false })

        if (pubError) throw pubError

        // Transform Supabase column names to match app's expected format
        const transformedPubs = pubRatings.map(row => ({
          'Pub Name': row.pub_name,
          'Location': row.location,
          'Price': row.price,
          'Date of Visit': row.date_of_visit,
          'Alumni Present': row.alumni_present,
          'Submitted By': row.submitted_by,
          'Taste': row.taste,
          'Texture': row.texture,
          'Stickage ': row.stickage,
          'Head to Body Ratio': row.head_to_body_ratio,
          'Pub Character': row.pub_character,
          'Overall Score': row.overall_score,
          'Comments': row.comments,
          'id': row.id
        }))

        setPubData(transformedPubs)

        // Calculate alumni stats from pub data
        const alumniStats = calculateAlumniStats(transformedPubs)
        setAlumniData(alumniStats)

        setLoading(false)
      } catch (err) {
        console.error('Fetch error:', err)
        setError(`Failed to load: ${err.message}`)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Calculate alumni statistics from pub ratings
  const calculateAlumniStats = (pubs) => {
    const alumniMap = {}

    pubs.forEach(pub => {
      // Handle legacy data with comma-separated alumni
      const present = pub['Alumni Present']
      if (present) {
        present.split(',').forEach(name => {
          const trimmed = name.trim()
          if (trimmed) {
            if (!alumniMap[trimmed]) {
              alumniMap[trimmed] = { visits: [], totalSpent: 0 }
            }
            alumniMap[trimmed].visits.push(pub)
            alumniMap[trimmed].totalSpent += pub.Price || 0
          }
        })
      }

      // Handle new data with individual submitter
      const submitter = pub['Submitted By']
      if (submitter) {
        const trimmed = submitter.trim()
        if (trimmed && !alumniMap[trimmed]?.visits.includes(pub)) {
          if (!alumniMap[trimmed]) {
            alumniMap[trimmed] = { visits: [], totalSpent: 0 }
          }
          alumniMap[trimmed].visits.push(pub)
          alumniMap[trimmed].totalSpent += pub.Price || 0
        }
      }
    })

    return Object.entries(alumniMap).map(([name, data]) => {
      const scores = data.visits.filter(v => typeof v['Overall Score'] === 'number').map(v => v['Overall Score'])
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      return {
        'Alumni': name,
        'Pubs Visited': data.visits.length,
        'Average Pub Score': avgScore,
        'Attendance Record': data.visits.length / pubs.length,
        'Money Invested': data.totalSpent
      }
    }).sort((a, b) => b['Pubs Visited'] - a['Pubs Visited'])
  }

  const locations = [...new Set(pubData.map(pub => pub.Location).filter(Boolean))].sort()
  const existingPubNames = [...new Set(pubData.map(pub => pub['Pub Name']).filter(Boolean))].sort()
  const existingNames = [...new Set([
    ...pubData.map(pub => pub['Submitted By']).filter(Boolean),
    ...pubData.flatMap(pub => pub['Alumni Present']?.split(',').map(n => n.trim()) || []).filter(Boolean)
  ])].sort()

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

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDeleteRating = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rating?')) return

    const { error } = await supabase
      .from('pub_ratings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting rating:', error)
      alert('Failed to delete rating')
      return
    }

    // Remove from local state
    const updatedPubs = pubData.filter(pub => pub.id !== id)
    setPubData(updatedPubs)
    setAlumniData(calculateAlumniStats(updatedPubs))
  }

  // Get submissions sorted by date (most recent first)
  const getSubmissionsByDate = () => {
    return [...pubData].sort((a, b) => {
      const dateA = a['Date of Visit'] || ''
      const dateB = b['Date of Visit'] || ''
      return dateB.localeCompare(dateA)
    })
  }

  const handleSubmitRating = async (e) => {
    e.preventDefault()

    const overallScore = (
      parseFloat(formData.taste) +
      parseFloat(formData.texture) +
      parseFloat(formData.stickage) +
      parseFloat(formData.headToBody) +
      parseFloat(formData.pubCharacter)
    ) / 5

    // Get the next available ID
    const { data: maxIdResult } = await supabase
      .from('pub_ratings')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)

    const nextId = (maxIdResult?.[0]?.id || 0) + 1

    // Save to Supabase
    const { data, error } = await supabase
      .from('pub_ratings')
      .insert([{
        id: nextId,
        pub_name: formData.pubName,
        location: formData.location,
        price: parseFloat(formData.price) || null,
        date_of_visit: formData.date,
        submitted_by: formData.submittedBy,
        taste: parseFloat(formData.taste),
        texture: parseFloat(formData.texture),
        stickage: parseFloat(formData.stickage),
        head_to_body_ratio: parseFloat(formData.headToBody),
        pub_character: parseFloat(formData.pubCharacter),
        overall_score: overallScore,
        comments: formData.comments
      }])
      .select()

    if (error) {
      console.error('Error saving rating:', error)
      setError(`Failed to save: ${error.message}`)
      return
    }

    // Add to local state with transformed format
    const newRating = {
      'Pub Name': formData.pubName,
      'Location': formData.location,
      'Price': parseFloat(formData.price) || 0,
      'Date of Visit': formData.date,
      'Submitted By': formData.submittedBy,
      'Taste': parseFloat(formData.taste),
      'Texture': parseFloat(formData.texture),
      'Stickage ': parseFloat(formData.stickage),
      'Head to Body Ratio': parseFloat(formData.headToBody),
      'Pub Character': parseFloat(formData.pubCharacter),
      'Overall Score': overallScore,
      'Comments': formData.comments,
      'id': data[0]?.id
    }

    setPubData(prev => [...prev, newRating])
    setAlumniData(calculateAlumniStats([...pubData, newRating]))

    // Reset form
    setFormData({
      pubName: '',
      location: '',
      price: '',
      date: new Date().toISOString().split('T')[0],
      submittedBy: '',
      taste: 7,
      texture: 7,
      stickage: 7,
      headToBody: 7,
      pubCharacter: 7,
      comments: ''
    })

    setFormSubmitted(true)
    setTimeout(() => setFormSubmitted(false), 3000)
  }

  // Stats calculations
  const getStats = () => {
    const validPubs = pubData.filter(p => typeof p['Overall Score'] === 'number')

    // Score distribution
    const scoreRanges = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, '<6': 0 }
    validPubs.forEach(pub => {
      const score = pub['Overall Score']
      if (score >= 9) scoreRanges['9-10']++
      else if (score >= 8) scoreRanges['8-9']++
      else if (score >= 7) scoreRanges['7-8']++
      else if (score >= 6) scoreRanges['6-7']++
      else scoreRanges['<6']++
    })

    // Category averages
    const categories = ['Taste', 'Texture', 'Stickage ', 'Head to Body Ratio', 'Pub Character']
    const categoryAvgs = categories.map(cat => {
      const valid = validPubs.filter(p => typeof p[cat] === 'number')
      const avg = valid.reduce((sum, p) => sum + p[cat], 0) / valid.length
      return { name: cat.replace(' ', ''), avg }
    })

    // Top pub by each category
    const topByCategory = categories.map(cat => {
      const sorted = [...validPubs].filter(p => typeof p[cat] === 'number').sort((a, b) => b[cat] - a[cat])
      return { category: cat, pub: sorted[0] }
    })

    // Price stats - filter out zero/null prices
    const pricesValid = validPubs.filter(p => typeof p.Price === 'number' && p.Price > 0)
    const avgPrice = pricesValid.length > 0 ? pricesValid.reduce((sum, p) => sum + p.Price, 0) / pricesValid.length : 0
    const cheapestPub = pricesValid.length > 0 ? pricesValid.reduce((min, p) => p.Price < min.Price ? p : min, pricesValid[0]) : null
    const mostExpensivePub = pricesValid.length > 0 ? pricesValid.reduce((max, p) => p.Price > max.Price ? p : max, pricesValid[0]) : null
    const minPrice = cheapestPub?.Price || 0
    const maxPrice = mostExpensivePub?.Price || 0

    // Location stats
    const locationCounts = {}
    validPubs.forEach(pub => {
      const loc = pub.Location || 'Unknown'
      locationCounts[loc] = (locationCounts[loc] || 0) + 1
    })
    const topLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

    return { scoreRanges, categoryAvgs, topByCategory, avgPrice, minPrice, maxPrice, cheapestPub, mostExpensivePub, topLocations, totalPubs: validPubs.length }
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

  const stats = getStats()

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
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add Rating
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Insights
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
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
                        className={`${getRankClass(rank)} ${isExpanded ? 'expanded' : ''} ${pub._isLocal ? 'local-rating' : ''}`}
                        onClick={() => setSelectedPub(pub)}
                      >
                        <td className="col-rank">
                          <span className={`rank-badge ${getRankClass(rank)}`}>{rank}</span>
                        </td>
                        <td className="col-name">
                          {pub['Pub Name']}
                          {pub._isLocal && <span className="local-badge">New</span>}
                        </td>
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
                                {pub['Submitted By'] && <p><strong>Rated by:</strong> {pub['Submitted By']}</p>}
                                {pub['Alumni Present'] && <p><strong>Alumni:</strong> {pub['Alumni Present']}</p>}
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

          {alumniData.length > 0 && (() => {
            const validAlumni = alumniData.filter(a => typeof a['Average Pub Score'] === 'number')
            const harshest = [...validAlumni].sort((a, b) => a['Average Pub Score'] - b['Average Pub Score'])[0]
            const kindest = [...validAlumni].sort((a, b) => b['Average Pub Score'] - a['Average Pub Score'])[0]
            const mostDedicated = [...alumniData].filter(a => typeof a['Attendance Record'] === 'number').sort((a, b) => b['Attendance Record'] - a['Attendance Record'])[0]
            const bigSpender = [...alumniData].filter(a => typeof a['Money Invested'] === 'number').sort((a, b) => b['Money Invested'] - a['Money Invested'])[0]
            const veteran = [...alumniData].filter(a => typeof a['Pubs Visited'] === 'number').sort((a, b) => b['Pubs Visited'] - a['Pubs Visited'])[0]

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

      {activeTab === 'add' && (
        <div className="add-rating-container">
          <div className="form-header">
            <h2>Add New Rating</h2>
            <p>Record a new pub visit and rating</p>
          </div>

          {formSubmitted && (
            <div className="success-message">
              Rating submitted successfully! View it in the Leaderboard.
            </div>
          )}

          <form onSubmit={handleSubmitRating} className="rating-form">
            <div className="form-grid">
              <div className="form-group">
                <label>Pub Name *</label>
                <input
                  type="text"
                  value={formData.pubName}
                  onChange={(e) => handleFormChange('pubName', e.target.value)}
                  placeholder="Enter pub name"
                  list="pub-names"
                  required
                />
                <datalist id="pub-names">
                  {existingPubNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label>Location *</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleFormChange('location', e.target.value)}
                  placeholder="e.g., South (City)"
                  list="locations"
                  required
                />
                <datalist id="locations">
                  {locations.map(loc => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label>Price (€)</label>
                <input
                  type="number"
                  step="0.10"
                  value={formData.price}
                  onChange={(e) => handleFormChange('price', e.target.value)}
                  placeholder="5.90"
                />
              </div>

              <div className="form-group">
                <label>Date of Visit</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleFormChange('date', e.target.value)}
                />
              </div>

              <div className="form-group full-width">
                <label>Your Name *</label>
                <input
                  type="text"
                  value={formData.submittedBy}
                  onChange={(e) => handleFormChange('submittedBy', e.target.value)}
                  placeholder="Enter your name"
                  list="names"
                  required
                />
                <datalist id="names">
                  {existingNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="scores-section">
              <h3>Category Scores</h3>
              <div className="score-sliders">
                {[
                  { key: 'taste', label: 'Taste' },
                  { key: 'texture', label: 'Texture' },
                  { key: 'stickage', label: 'Stickage' },
                  { key: 'headToBody', label: 'Head to Body Ratio' },
                  { key: 'pubCharacter', label: 'Pub Character' }
                ].map(({ key, label }) => (
                  <div className="score-slider" key={key}>
                    <div className="slider-header">
                      <label>{label}</label>
                      <span className="slider-value">{formData[key]}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.1"
                      value={formData[key]}
                      onChange={(e) => handleFormChange(key, e.target.value)}
                    />
                    <div className="slider-labels">
                      <span>1</span>
                      <span>10</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="overall-preview">
                <span className="preview-label">Overall Score Preview</span>
                <span className="preview-score">
                  {((parseFloat(formData.taste) + parseFloat(formData.texture) + parseFloat(formData.stickage) + parseFloat(formData.headToBody) + parseFloat(formData.pubCharacter)) / 5).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="form-group full-width">
              <label>Comments</label>
              <textarea
                value={formData.comments}
                onChange={(e) => handleFormChange('comments', e.target.value)}
                placeholder="Add any notes about this pint..."
                rows="3"
              />
            </div>

            <button type="submit" className="submit-btn">
              Submit Rating
            </button>
          </form>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="stats-container">
          <div className="stats-header">
            <h2>Insights & Statistics</h2>
            <p>Data from {stats.totalPubs} pub ratings</p>
          </div>

          <div className="stats-grid">
            {/* Score Distribution */}
            <div className="stats-card large">
              <h3>Score Distribution</h3>
              <div className="distribution-chart">
                {Object.entries(stats.scoreRanges).map(([range, count]) => (
                  <div className="dist-bar-container" key={range}>
                    <span className="dist-label">{range}</span>
                    <div className="dist-bar-bg">
                      <div
                        className="dist-bar-fill"
                        style={{ width: `${(count / stats.totalPubs) * 100}%` }}
                      />
                    </div>
                    <span className="dist-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Averages */}
            <div className="stats-card large">
              <h3>Category Averages</h3>
              <div className="category-chart">
                {stats.categoryAvgs.map(({ name, avg }) => (
                  <div className="cat-bar-container" key={name}>
                    <span className="cat-label">{name.replace('Stickage', 'Stickage').replace('HeadtoBodyRatio', 'H2B Ratio').replace('PubCharacter', 'Pub Char')}</span>
                    <div className="cat-bar-bg">
                      <div
                        className="cat-bar-fill"
                        style={{ width: `${(avg / 10) * 100}%` }}
                      />
                    </div>
                    <span className="cat-value">{avg.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price Stats */}
            <div className="stats-card">
              <h3>Price Analysis</h3>
              <div className="price-stats">
                <div className="price-stat">
                  <span className="price-label">Average</span>
                  <span className="price-value">€{stats.avgPrice.toFixed(2)}</span>
                </div>
                <div className="price-stat">
                  <span className="price-label">Cheapest</span>
                  <span className="price-value">€{stats.minPrice.toFixed(2)}</span>
                  {stats.cheapestPub && <span className="price-pub">{stats.cheapestPub['Pub Name']}</span>}
                </div>
                <div className="price-stat">
                  <span className="price-label">Most Expensive</span>
                  <span className="price-value">€{stats.maxPrice.toFixed(2)}</span>
                  {stats.mostExpensivePub && <span className="price-pub">{stats.mostExpensivePub['Pub Name']}</span>}
                </div>
              </div>
            </div>

            {/* Top Locations */}
            <div className="stats-card">
              <h3>Top Locations</h3>
              <div className="location-list">
                {stats.topLocations.map(([loc, count], i) => (
                  <div className="location-item" key={loc}>
                    <span className="location-rank">{i + 1}</span>
                    <span className="location-name">{loc}</span>
                    <span className="location-count">{count} pubs</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top by Category */}
            <div className="stats-card full-width">
              <h3>Best Pub by Category</h3>
              <div className="top-by-category">
                {stats.topByCategory.map(({ category, pub }) => (
                  <div className="category-winner" key={category}>
                    <span className="winner-category">{category.replace('Stickage ', 'Stickage')}</span>
                    <span className="winner-pub">{pub?.['Pub Name'] || 'N/A'}</span>
                    <span className="winner-score">{pub?.[category]?.toFixed(1) || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <div className="alumni-header">
            <h2>Submission History</h2>
            <p className="alumni-subtitle">All ratings ordered by date</p>
          </div>

          <div className="table-container">
            <table className="rankings-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pub Name</th>
                  <th>Score</th>
                  <th>Submitted By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getSubmissionsByDate().map((pub) => (
                  <tr key={pub.id}>
                    <td>{formatDate(pub['Date of Visit'])}</td>
                    <td>{pub['Pub Name']}</td>
                    <td>
                      <span className="score-badge">
                        {typeof pub['Overall Score'] === 'number' ? pub['Overall Score'].toFixed(2) : 'N/A'}
                      </span>
                    </td>
                    <td>{pub['Submitted By'] || pub['Alumni Present'] || 'Unknown'}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteRating(pub.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
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

            {selectedPub['Submitted By'] && (
              <div className="modal-alumni">
                <span className="modal-detail-label">Rated by</span>
                <div className="alumni-chips">
                  <span className="alumni-chip">{selectedPub['Submitted By']}</span>
                </div>
              </div>
            )}

            {selectedPub['Alumni Present'] && (
              <div className="modal-alumni">
                <span className="modal-detail-label">Alumni Present</span>
                <div className="alumni-chips">
                  {selectedPub['Alumni Present']?.split(',').map((name, i) => (
                    <span key={i} className="alumni-chip">{name.trim()}</span>
                  ))}
                </div>
              </div>
            )}

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
