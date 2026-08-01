package org.daymark.display;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class DaymarkAddressTest {
    @Test
    public void suppliesTheDefaultAddress() {
        assertEquals(DaymarkAddress.DEFAULT_URL, DaymarkAddress.normalize("  "));
    }

    @Test
    public void addsHttpAndRemovesTrailingSlashes() {
        assertEquals(
            "http://192.168.1.170:8080",
            DaymarkAddress.normalize("192.168.1.170:8080///")
        );
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsNonWebSchemes() {
        DaymarkAddress.normalize("file:///tmp/daymark");
    }

    @Test
    public void comparesOriginsIncludingDefaultPorts() {
        assertTrue(DaymarkAddress.isSameOrigin(
            "http://daymark.local:8080",
            "http://daymark.local:8080/today"
        ));
        assertTrue(DaymarkAddress.isSameOrigin(
            "https://daymark.example",
            "https://daymark.example:443/settings"
        ));
        assertFalse(DaymarkAddress.isSameOrigin(
            "http://daymark.local:8080",
            "https://accounts.google.com/o/oauth2/v2/auth"
        ));
    }
}
