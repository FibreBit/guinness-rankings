import { useState, useEffect, Fragment } from 'react'
import { supabase } from './supabaseClient'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import './App.css'

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const OPENCAGE_API_KEY = '179498d6748a4481ac32428d59327069'

// Geocode a pub name to get coordinates
async function geocodePub(pubName, location) {
  const query = `${pubName}, ${location || 'Dublin'}, Ireland`
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_API_KEY}&countrycode=ie&limit=1`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.results && data.results.length > 0) {
      const result = data.results[0]
      return {
        latitude: result.geometry.lat,
        longitude: result.geometry.lng,
        confidence: result.confidence
      }
    }
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

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
  const [expandedAlumni, setExpandedAlumni] = useState(null)
  const [showAlumniPubs, setShowAlumniPubs] = useState(null)
  const [inlineProfile, setInlineProfile] = useState(null)
  const [newestMember, setNewestMember] = useState(null)
  const [mapStatusFilter, setMapStatusFilter] = useState('all')

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
          'id': row.id,
          'Latitude': row.latitude,
          'Longitude': row.longitude,
          'GeocodeConfidence': row.geocode_confidence
        }))

        setPubData(transformedPubs)

        // Calculate alumni stats from pub data
        const alumniStats = calculateAlumniStats(transformedPubs)
        setAlumniData(alumniStats)

        const validFirsts = alumniStats.filter(a => Number.isFinite(a.firstVisitTs))
        if (validFirsts.length > 0) {
          const newest = validFirsts.reduce((acc, curr) => {
            if (!acc) return curr
            return curr.firstVisitTs > acc.firstVisitTs ? curr : acc
          }, null)
          setNewestMember(newest)
        } else {
          setNewestMember(null)
        }


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

    const normalizeName = (name) => (name || '').trim().toLowerCase()
    const getRecord = (rawName) => {
      const key = normalizeName(rawName)
      if (!key) return null
      if (!alumniMap[key]) {
        alumniMap[key] = {
          displayName: rawName.trim(),
          submitted: [],
          attended: [],
          totalSpent: 0
        }
      }
      // Preserve the first seen cased version
      if (!alumniMap[key].displayName && rawName.trim()) {
        alumniMap[key].displayName = rawName.trim()
      }
      return alumniMap[key]
    }

    const getDateValue = (val) => {
      if (!val || val === 'Unknown') return null
      if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000)
        return isNaN(date.getTime()) ? null : date.getTime()
      }
      const date = new Date(val)
      return isNaN(date.getTime()) ? null : date.getTime()
    }

    pubs.forEach(pub => {
      const visitTs = getDateValue(pub['Date of Visit'])
      // Handle legacy data with comma-separated alumni (attended but didn't rate)
      const present = pub['Alumni Present']
      if (present) {
        present.split(',').forEach(name => {
          const rec = getRecord(name)
          if (rec) {
            // Only add to attended if they didn't also submit this pub
            const submitterKey = normalizeName(pub['Submitted By'])
            if (submitterKey !== normalizeName(name)) {
              rec.attended.push(pub)
            }
            rec.totalSpent += pub.Price || 0
            if (visitTs !== null) {
              rec.firstVisitTs = rec.firstVisitTs === undefined ? visitTs : Math.min(rec.firstVisitTs, visitTs)
            }
          }
        })
      }

      // Handle new data with individual submitter (they actually rated)
      const submitter = pub['Submitted By']
      if (submitter) {
        const rec = getRecord(submitter)
        if (rec && !rec.submitted.some(p => p.id === pub.id)) {
          rec.submitted.push(pub)
          rec.totalSpent += pub.Price || 0
          if (visitTs !== null) {
            rec.firstVisitTs = rec.firstVisitTs === undefined ? visitTs : Math.min(rec.firstVisitTs, visitTs)
          }
        }
      }
    })

    return Object.values(alumniMap)
      .map((data) => {
        const allVisits = [...data.submitted, ...data.attended]
        const scoresFromSubmitted = data.submitted
          .map(v => Number(v['Overall Score']))
          .filter(Number.isFinite)
        const scoresFallback = scoresFromSubmitted.length > 0
          ? scoresFromSubmitted
          : data.attended
            .map(v => Number(v['Overall Score']))
            .filter(Number.isFinite)
        const avgScore = scoresFallback.length > 0 ? scoresFallback.reduce((a, b) => a + b, 0) / scoresFallback.length : 0
        return {
          'Alumni': data.displayName,
          'Pubs Visited': allVisits.length,
          'Average Pub Score': avgScore,
          'Attendance Record': pubs.length ? allVisits.length / pubs.length : 0,
          'Money Invested': data.totalSpent,
          'submitted': data.submitted,
          'attended': data.attended,
          firstVisitTs: data.firstVisitTs ?? null
        }
      })
      .sort((a, b) => b['Pubs Visited'] - a['Pubs Visited'])
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

  const sortByDateDesc = (pubs) => {
    return [...pubs].sort((a, b) => {
      const da = a['Date of Visit'] || ''
      const db = b['Date of Visit'] || ''
      return db.localeCompare(da)
    })
  }

  const getBestWorstPub = (alumni) => {
    const source = alumni.submitted.length > 0 ? alumni.submitted : alumni.attended
    const rated = source
      .map(p => ({ ...p, _scoreNum: Number(p['Overall Score']) }))
      .filter(p => Number.isFinite(p._scoreNum))
    if (rated.length === 0) return { best: null, worst: null }
    const best = rated.reduce((max, p) => (p._scoreNum > max._scoreNum ? p : max), rated[0])
    const worst = rated.reduce((min, p) => (p._scoreNum < min._scoreNum ? p : min), rated[0])
    return { best, worst }
  }

  const formatTsDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''


  const getAlumniCategoryAverages = (alumni) => {
    const categories = [
      { key: 'Taste', label: 'Taste' },
      { key: 'Texture', label: 'Texture' },
      { key: 'Stickage ', label: 'Stickage' },
      { key: 'Head to Body Ratio', label: 'Head:Body' },
      { key: 'Pub Character', label: 'Pub Char' }
    ]
    const sourcePubs = alumni.submitted.length > 0 ? alumni.submitted : alumni.attended
    return categories.map(cat => {
      const rated = sourcePubs.filter(p => typeof p[cat.key] === 'number')
      const avg = rated.length ? rated.reduce((sum, p) => sum + p[cat.key], 0) / rated.length : 0
      return { ...cat, avg }
    })
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

    // Geocode the pub to get coordinates for the map
    const coords = await geocodePub(formData.pubName, formData.location)

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
        comments: formData.comments,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
        geocode_confidence: coords?.confidence || null
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
      'id': data[0]?.id,
      'Latitude': coords?.latitude || null,
      'Longitude': coords?.longitude || null,
      'GeocodeConfidence': coords?.confidence || null
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
        <p className="subtitle">Track, rate, and compare Dublin's finest pints.</p>
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
        <button
          className={`tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          Map
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
                        onClick={() => setExpandedRow(isExpanded ? null : index)}
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
                {newestMember && (
                  <div className="stat-card">
                    <span className="stat-icon">👶</span>
                    <span className="stat-label">Newest Member</span>
                    <span className="stat-value">{newestMember.Alumni}</span>
                    <span className="stat-detail">{formatTsDate(newestMember.firstVisitTs)}</span>
                  </div>
                )}
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
                  const isExpanded = expandedAlumni === alumni.Alumni
                  return (
                    <Fragment key={index}>
                      <tr
                        className={`${getRankClass(rank)} clickable-row`}
                        onClick={() => {
                          const next = isExpanded ? null : alumni.Alumni
                          setExpandedAlumni(next)
                          setShowAlumniPubs(null)
                          setInlineProfile(null)
                        }}
                      >
                        <td className="col-rank">
                          <span className={`rank-badge ${getRankClass(rank)}`}>{rank}</span>
                        </td>
                        <td className="alumni-name">
                          <span className="alumni-name-inner">
                            <span className={`expand-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
                            {alumni.Alumni}
                          </span>
                        </td>
                        <td>{alumni['Pubs Visited']}</td>
                        <td>
                          <span className="score-badge">{typeof alumni['Average Pub Score'] === 'number' ? alumni['Average Pub Score'].toFixed(2) : 'N/A'}</span>
                        </td>
                        <td>{typeof alumni['Attendance Record'] === 'number' ? (alumni['Attendance Record'] * 100).toFixed(0) : 'N/A'}%</td>
                        <td className="money">€{typeof alumni['Money Invested'] === 'number' ? alumni['Money Invested'].toFixed(2) : 'N/A'}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="expanded-row">
                          <td colSpan="6">
                            <div className="alumni-pubs-list">
                              <div className="profile-cta dual">
                                <button
                                  className="profile-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setShowAlumniPubs(null)
                                    setInlineProfile(prev =>
                                      prev === alumni.Alumni ? null : alumni.Alumni
                                    )
                                  }}
                                >
                                  {inlineProfile === alumni.Alumni ? 'Hide profile' : `Show profile`}
                                </button>
                                <button
                                  className="profile-btn ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const next = showAlumniPubs === alumni.Alumni ? null : alumni.Alumni
                                    setShowAlumniPubs(next)
                                    if (next) setInlineProfile(null) // hide inline profile when viewing all pubs
                                  }}
                                >
                                  All pubs ({alumni['Pubs Visited']})
                                </button>
                              </div>

                              {showAlumniPubs === alumni.Alumni && (
                                <div className="alumni-all-pubs">
                                  {(() => {
                                    const combined = [...alumni.submitted, ...alumni.attended]
                                    const seen = new Set()
                                    const uniques = combined.filter(pub => {
                                      const key = `${pub.id || pub['Pub Name']}-${pub['Date of Visit'] || ''}`
                                      if (seen.has(key)) return false
                                      seen.add(key)
                                      return true
                                    })
                                    const sorted = sortByDateDesc(uniques)
                                    return (
                                      <div className="alumni-pubs-grid">
                                        {sorted.map((pub, i) => (
                                          <div key={i} className="alumni-pub-card">
                                            <div className="alumni-pub-name">{pub['Pub Name']}</div>
                                            <div className="alumni-pub-details">
                                              <span className="alumni-pub-location">{pub.Location}</span>
                                              <span className="alumni-pub-score">
                                                {typeof pub['Overall Score'] === 'number' ? pub['Overall Score'].toFixed(2) : 'N/A'}
                                              </span>
                                            </div>
                                            {pub.Price > 0 && <div className="alumni-pub-price">€{pub.Price.toFixed(2)}</div>}
                                            <div className="alumni-pub-date">{formatDate(pub['Date of Visit'])}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                </div>
                              )}

                              {showAlumniPubs !== alumni.Alumni && inlineProfile === alumni.Alumni && (
                                <div className="inline-profile-card">
                                  <div className="profile-metrics">
                                    <div className="profile-metric">
                                      <span className="metric-label">Pubs Visited</span>
                                      <span className="metric-value">{alumni['Pubs Visited']}</span>
                                    </div>
                                    <div className="profile-metric">
                                      <span className="metric-label">Avg Score</span>
                                      <span className="metric-value">
                                        {typeof alumni['Average Pub Score'] === 'number'
                                          ? alumni['Average Pub Score'].toFixed(2)
                                          : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="profile-metric">
                                      <span className="metric-label">Attendance</span>
                                      <span className="metric-value">
                                        {typeof alumni['Attendance Record'] === 'number'
                                          ? `${(alumni['Attendance Record'] * 100).toFixed(0)}%`
                                          : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="profile-metric">
                                      <span className="metric-label">Money Invested</span>
                                      <span className="metric-value">
                                        €{typeof alumni['Money Invested'] === 'number'
                                          ? alumni['Money Invested'].toFixed(2)
                                          : '0.00'}
                                      </span>
                                    </div>
                                    {(() => {
                                      const { best, worst } = getBestWorstPub(alumni)
                                      return (
                                        <>
                                          <div className="profile-metric pub-highlight">
                                            <span className="metric-label">Favourite Pub</span>
                                            <span className="metric-value">{best ? best['Pub Name'] : '—'}</span>
                                            <span className="metric-subvalue">
                                              {best && Number.isFinite(best._scoreNum) ? best._scoreNum.toFixed(2) : ''}
                                            </span>
                                          </div>
                                          <div className="profile-metric pub-lowlight">
                                            <span className="metric-label">Least Favourite</span>
                                            <span className="metric-value">{worst ? worst['Pub Name'] : '—'}</span>
                                            <span className="metric-subvalue">
                                              {worst && Number.isFinite(worst._scoreNum) ? worst._scoreNum.toFixed(2) : ''}
                                            </span>
                                          </div>
                                        </>
                                      )
                                    })()}
                                  </div>

                                  <div className="profile-section">
                                    <h4>Recent pubs with {alumni.Alumni}</h4>
                                    <div className="alumni-pubs-grid">
                                      {sortByDateDesc([...alumni.submitted, ...alumni.attended]).slice(0, 4).map((pub, i) => (
                                        <div key={i} className="alumni-pub-card">
                                          <div className="alumni-pub-name">{pub['Pub Name']}</div>
                                          <div className="alumni-pub-details">
                                            <span className="alumni-pub-location">{pub.Location}</span>
                                            <span className="alumni-pub-score">
                                              {typeof pub['Overall Score'] === 'number' ? pub['Overall Score'].toFixed(2) : 'N/A'}
                                            </span>
                                          </div>
                                          {pub.Price > 0 && <div className="alumni-pub-price">€{pub.Price.toFixed(2)}</div>}
                                          <div className="alumni-pub-date">{formatDate(pub['Date of Visit'])}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {alumni.submitted.length === 0 && alumni.attended.length === 0 && (
                                <p>No pub visits recorded.</p>
                              )}
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

      {activeTab === 'map' && (
        <div>
          <div className="alumni-header">
            <h2>Pub Map</h2>
            <p className="alumni-subtitle">Explore {pubData.filter(p => p.Latitude && p.Longitude).length} visited pubs across Dublin</p>
          </div>

          <div className="map-container">
            <MapContainer
              center={[53.3498, -6.2603]}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {pubData
                .filter(pub => pub.Latitude && pub.Longitude)
                .map((pub) => (
                  <Marker
                    key={pub.id}
                    position={[pub.Latitude, pub.Longitude]}
                  >
                    <Popup>
                      <div className="map-popup">
                        <h3>{pub['Pub Name']}</h3>
                        <p className="popup-location">{pub.Location}</p>
                        {typeof pub['Overall Score'] === 'number' && (
                          <p className="popup-score">Score: <strong>{pub['Overall Score'].toFixed(2)}</strong></p>
                        )}
                        {typeof pub.Price === 'number' && pub.Price > 0 && (
                          <p className="popup-price">Price: €{pub.Price.toFixed(2)}</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>

          {/* Pubs Missing Coordinates */}
          {(() => {
            const GENERIC_LAT = 53.33306
            const GENERIC_LNG = -6.24889
            const missingPubs = pubData.filter(p =>
              !p.Latitude || !p.Longitude ||
              (Math.abs(p.Latitude - GENERIC_LAT) < 0.0001 && Math.abs(p.Longitude - GENERIC_LNG) < 0.0001)
            )
            if (missingPubs.length === 0) return null
            return (
              <div className="map-section">
                <h3>Pubs Missing from Map ({missingPubs.length})</h3>
                <p className="section-subtitle">These pubs need coordinates to appear on the map</p>
                <div className="missing-pubs-list">
                  {missingPubs.map(pub => (
                    <div key={pub.id} className="missing-pub-item">
                      <span className="missing-pub-name">{pub['Pub Name']}</span>
                      <span className="missing-pub-location">{pub.Location}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* All Pubs Coordinate Status */}
          {(() => {
            const GENERIC_LAT = 53.33306
            const GENERIC_LNG = -6.24889

            // Calculate status for each pub
            const pubsWithStatus = pubData.map(pub => {
              const isGeneric = pub.Latitude && pub.Longitude &&
                Math.abs(pub.Latitude - GENERIC_LAT) < 0.0001 &&
                Math.abs(pub.Longitude - GENERIC_LNG) < 0.0001
              const isMissing = !pub.Latitude || !pub.Longitude

              let status, statusClass
              if (isMissing) {
                status = 'Missing'
                statusClass = 'status-missing'
              } else if (isGeneric) {
                status = 'Generic'
                statusClass = 'status-generic'
              } else if (pub.GeocodeConfidence && pub.GeocodeConfidence >= 8) {
                status = 'Verified'
                statusClass = 'status-verified'
              } else {
                status = 'Mapped'
                statusClass = 'status-mapped'
              }

              return { ...pub, status, statusClass }
            })

            // Count by status
            const counts = {
              all: pubsWithStatus.length,
              Missing: pubsWithStatus.filter(p => p.status === 'Missing').length,
              Generic: pubsWithStatus.filter(p => p.status === 'Generic').length,
              Mapped: pubsWithStatus.filter(p => p.status === 'Mapped').length,
              Verified: pubsWithStatus.filter(p => p.status === 'Verified').length
            }

            // Filter and sort by name
            const filteredPubs = pubsWithStatus
              .filter(p => mapStatusFilter === 'all' || p.status === mapStatusFilter)
              .sort((a, b) => a['Pub Name'].localeCompare(b['Pub Name']))

            return (
              <div className="map-section">
                <h3>All Pubs - Coordinate Status</h3>

                <div className="status-filters">
                  <button
                    className={`status-filter-btn ${mapStatusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMapStatusFilter('all')}
                  >
                    All ({counts.all})
                  </button>
                  <button
                    className={`status-filter-btn status-missing ${mapStatusFilter === 'Missing' ? 'active' : ''}`}
                    onClick={() => setMapStatusFilter('Missing')}
                  >
                    Missing ({counts.Missing})
                  </button>
                  <button
                    className={`status-filter-btn status-generic ${mapStatusFilter === 'Generic' ? 'active' : ''}`}
                    onClick={() => setMapStatusFilter('Generic')}
                  >
                    Generic ({counts.Generic})
                  </button>
                  <button
                    className={`status-filter-btn status-mapped ${mapStatusFilter === 'Mapped' ? 'active' : ''}`}
                    onClick={() => setMapStatusFilter('Mapped')}
                  >
                    Mapped ({counts.Mapped})
                  </button>
                  <button
                    className={`status-filter-btn status-verified ${mapStatusFilter === 'Verified' ? 'active' : ''}`}
                    onClick={() => setMapStatusFilter('Verified')}
                  >
                    Verified ({counts.Verified})
                  </button>
                </div>

                <div className="table-container">
                  <table className="rankings-table confidence-table">
                    <thead>
                      <tr>
                        <th>Pub Name</th>
                        <th>Location</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPubs.map(pub => (
                        <tr key={pub.id} className={pub.statusClass}>
                          <td>{pub['Pub Name']}</td>
                          <td>{pub.Location}</td>
                          <td><span className={`status-badge ${pub.statusClass}`}>{pub.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
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
