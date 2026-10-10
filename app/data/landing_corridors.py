"""Corridors the landing page globe tours, in tour order.

This is the landing page's only hand-typed factual data: the city names and
coordinates of each arc's ends. Every entry names its source, a Case Desk case
or a seeded corridor rule, and tests/test_landing_corridors.py checks each one
against that source. At most eight entries: one per categorical colour slot.
"""

LANDING_CORRIDORS = [
    {
        "currency": "GBP",
        "origin": {"city": "Lagos", "country": "NG", "lat": 6.45, "lon": 3.39},
        "destination": {"city": "London", "country": "GB", "lat": 51.51, "lon": -0.13},
        "source": {
            "kind": "case",
            "case_id": "nigeria-uk-contractor",
            "corridor_label": "Nigeria → United Kingdom",
        },
    },
    {
        "currency": "USD",
        "origin": {"city": "Toronto", "country": "CA", "lat": 43.65, "lon": -79.38},
        "destination": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "source": {
            "kind": "case",
            "case_id": "canada-us-supplier",
            "corridor_label": "Canada → United States",
        },
    },
    {
        "currency": "EUR",
        "origin": {"city": "London", "country": "GB", "lat": 51.51, "lon": -0.13},
        "destination": {"city": "Frankfurt", "country": "DE", "lat": 50.11, "lon": 8.68},
        "source": {
            "kind": "case",
            "case_id": "uk-eurozone-supplier",
            "corridor_label": "United Kingdom → Germany",
        },
    },
    {
        "currency": "MXN",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Mexico City", "country": "MX", "lat": 19.43, "lon": -99.13},
        "source": {
            "kind": "case",
            "case_id": "us-mexico-vendor",
            "corridor_label": "United States → Mexico",
        },
    },
    {
        "currency": "KES",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Nairobi", "country": "KE", "lat": -1.29, "lon": 36.82},
        "source": {
            "kind": "rule",
            "currency": "KES",
            "destination_country": "KE",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "INR",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Mumbai", "country": "IN", "lat": 19.08, "lon": 72.88},
        "source": {
            "kind": "rule",
            "currency": "INR",
            "destination_country": "IN",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "JPY",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Tokyo", "country": "JP", "lat": 35.68, "lon": 139.69},
        "source": {
            "kind": "rule",
            "currency": "JPY",
            "destination_country": "JP",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "AUD",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Sydney", "country": "AU", "lat": -33.87, "lon": 151.21},
        "source": {
            "kind": "rule",
            "currency": "AUD",
            "destination_country": "AU",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
]
