package org.daymark.display;

import java.net.URI;
import java.net.URISyntaxException;

final class DaymarkAddress {
    static final String DEFAULT_URL = "http://daymark.local:8080";

    private DaymarkAddress() {}

    static String normalize(String value) {
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty()) {
            return DEFAULT_URL;
        }
        if (!candidate.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*$")) {
            candidate = "http://" + candidate;
        }
        try {
            URI uri = new URI(candidate);
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
                throw new IllegalArgumentException("Use an HTTP or HTTPS address.");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new IllegalArgumentException("Enter a valid Daymark address.");
            }
            String normalized = uri.toString();
            while (normalized.endsWith("/") && normalized.length() > scheme.length() + 3) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
            return normalized;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Enter a valid Daymark address.", error);
        }
    }

    static boolean isSameOrigin(String configuredUrl, String candidateUrl) {
        try {
            URI configured = new URI(configuredUrl);
            URI candidate = new URI(candidateUrl);
            return configured.getScheme().equalsIgnoreCase(candidate.getScheme())
                && configured.getHost().equalsIgnoreCase(candidate.getHost())
                && effectivePort(configured) == effectivePort(candidate);
        } catch (RuntimeException | URISyntaxException error) {
            return false;
        }
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }
}
