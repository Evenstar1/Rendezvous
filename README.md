# Rendezvous — SPHEREx Blink & Astrophysical Laboratory

**2026 NASA Space Apps Challenge · Planet X and SPHEREx**  
**Team Afterlight · Evenstar1** · [github.com/evenstar1](https://github.com/evenstar1)

[![NASA Space Apps](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Challenge-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)
[![SPHEREx Mission](https://img.shields.io/badge/Mission-NASA%20SPHEREx-blue?style=for-the-badge)](https://spherex.caltech.edu/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](https://www.apache.org/licenses/LICENSE-2.0)
[![Pure In--Browser](https://img.shields.io/badge/Architecture-100%25%20Client--Side-green?style=for-the-badge)](https://vitejs.dev/)

---

## Executive Summary

**Rendezvous** is an in-browser web observatory and astrophysical analysis laboratory engineered for NASA's **SPHEREx** (*Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer*) mission, built for the 2026 NASA Space Apps Challenge (*Planet X and SPHEREx*).

Rendezvous provides a self-contained, client-side scientific workstation designed to solve the primary operational bottlenecks in discovering outer Solar System objects (Kuiper Belt Objects, Centaurs, comets, and hypothetical Planet X / Planet Nine) and characterising the solar neighbourhood's coldest brown dwarfs (Y and T dwarfs). Operating with **zero server-side computation**, Rendezvous performs:

1. **Sub-pixel multi-epoch blinking and difference imaging** to extract moving objects from static Galactic star fields.
2. **Sub-pixel circular aperture photometry with Gaussian PSF encircled-energy chromatic corrections** and Merline & Howell (1995) error propagation.
3. **Multi-epoch astrometry with King/Lindegren centroid uncertainties**, weighted linear proper-motion solutions, and automated **Solar-System reflex/Keplerian vs. Galactic stellar kinematic regime classification**.
4. **SED modeling with weighted Planck blackbody fits**, MAD-clipped power-law continuum slopes, and continuum-interpolated molecular equivalent widths for $\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}_2$, and $\text{CO}$.
5. **Time-series variability testing** with narrow-channel SED normalization, constant-flux $\chi^2_\nu$, Vaughan et al. (2003) fractional excess RMS ($F_{\text{var}}$), and Zechmeister & Kürster (2009) Generalized Lomb–Scargle (GLS) periodograms with analytical 1% False Alarm Probability (FAP) thresholds.
6. **In-browser FITS workbench** allowing users to drag and drop arbitrary SPHEREx Level-2 or WCS-calibrated FITS files for TAN-SIP reprojection, zodiacal light subtraction, and standards-compliant 32-bit IEEE float FITS export.

Bundled with five full offline Level-2 mission fields and live worldwide HiPS multi-survey mosaics spanning a 34-year baseline (DSS2 $\to$ 2MASS $\to$ AllWISE $\to$ SPHEREx), Rendezvous bridges the gap between accessible citizen-science discovery and publication-grade astrophysical verification.

---

## Table of Contents

- [1. Scientific Challenge & Mission Context](#1-scientific-challenge--mission-context)
  - [1.1 NASA's SPHEREx Mission](#11-nasas-spherex-mission)
  - [1.2 The Hunt for Planet X and Ultra-Cool Brown Dwarfs](#12-the-hunt-for-planet-x-and-ultra-cool-brown-dwarfs)
  - [1.3 The Technical Hurdle: Spectrophotometric False Positives](#13-the-technical-hurdle-spectrophotometric-false-positives)
- [2. System Architecture](#2-system-architecture)
  - [2.1 Zero-Backend Scientific Engine](#21-zero-backend-scientific-engine)
  - [2.2 Dual User Interfaces: Guided vs. Research Mode](#22-dual-user-interfaces-guided-vs-research-mode)
  - [2.3 Obstruction-Free Main Spectrum Frame](#23-obstruction-free-main-spectrum-frame)
- [3. Scientific Instrumentation & Mathematical Formulations](#3-scientific-instrumentation--mathematical-formulations)
  - [3.1 Blink Comparator & Moving-Object Dipole Engine](#31-blink-comparator--moving-object-dipole-engine)
  - [3.2 Multi-Epoch Astrometry & Kinematic Distance Classification](#32-multi-epoch-astrometry--kinematic-distance-classification)
  - [3.3 Radiometric Calibration, Sub-Pixel Photometry & Error Propagation](#33-radiometric-calibration-sub-pixel-photometry--error-propagation)
  - [3.4 Spectrophotometric Modeling & Molecular Chemistry](#34-spectrophotometric-modeling--molecular-chemistry)
  - [3.5 Time-Series Variability & Generalized Lomb–Scargle Periodogram](#35-time-series-variability--generalized-lombscargle-periodogram)
  - [3.6 Field Colour–Magnitude Diagram (CMD)](#36-field-colourmagnitude-diagram-cmd)
  - [3.7 In-Browser FITS Workbench & WCS Engine](#37-in-browser-fits-workbench--wcs-engine)
  - [3.8 In-Site Discovery Notebook](#38-in-site-discovery-notebook)
- [4. Bundled Mission Benchmark Fields](#4-bundled-mission-benchmark-fields)
- [5. 34-Year All-Sky Historical Survey Baseline](#5-34-year-all-sky-historical-survey-baseline)
- [6. Installation & Development](#6-installation--development)
- [7. Data Provenance & Mission Credits](#7-data-provenance--mission-credits)

---

## 1. Scientific Challenge & Mission Context

### 1.1 NASA's SPHEREx Mission
NASA's SPHEREx is a Medium-Class Explorer (MIDEX) space observatory executing an all-sky near-infrared spectral survey. Unlike traditional imaging telescopes equipped with discrete broadband filter wheels, SPHEREx mounts **six $2048 \times 2048$ HgCdTe detector arrays (D1 to D6)**, each fronted by a **Linear Variable Filter (LVF)**:
- **Continuous Wavelength Range**: $0.75\,\mu\text{m}$ to $5.00\,\mu\text{m}$ across 102 discrete spectral channels.
- **Spectral Resolution**: $R = \lambda / \Delta\lambda \approx 35$ for $0.75 \le \lambda \le 2.6\,\mu\text{m}$ (D1–D3), $R \approx 41$ for $2.6 \le \lambda \le 4.4\,\mu\text{m}$ (D4–D5), and $R \approx 130$ for $4.4 \le \lambda \le 5.0\,\mu\text{m}$ (D6).
- **Spatial Resolution**: $6.15''$ pixels over a $3.5^\circ \times 7^\circ$ instantaneous field of view.
- **Survey Cadence**: Scans the entire celestial sphere every 6 months, generating four independent, full-sky multi-band maps across its baseline mission.

### 1.2 The Hunt for Planet X and Ultra-Cool Brown Dwarfs
The outer Solar System beyond the Kuiper Belt cliff ($>50\text{ AU}$) remains largely uncharted. Clustering in the orbital elements of extreme trans-Neptunian objects (eTNOs) has pointed toward the gravitational influence of a distant, massive body—hypothetical **Planet Nine / Planet X** ($m \sim 5\text{--}10\,M_\oplus$, semi-major axis $a \sim 300\text{--}800\text{ AU}$). Simultaneously, the census of the solar neighbourhood remains incomplete for cold **Y-type and T-type brown dwarfs** ($T_{\text{eff}} < 500\text{ K}$).

These targets share key observational properties in infrared surveys:
1. **Apparent Motion Across Epochs**: While distant stars and galaxies are stationary, solar system objects and nearby stars exhibit measurable displacements across SPHEREx's 6-month survey epochs.
2. **Distinct Infrared Spectral Energy Distributions (SEDs)**:
   - Cold brown dwarfs (such as WISE 0855−0714 at $\approx 250\text{ K}$) are virtually invisible at optical and short near-IR wavelengths ($\lambda < 3.5\,\mu\text{m}$), but emit strongly in the thermal infrared ($4.0\text{--}5.0\,\mu\text{m}$), exhibiting deep absorption from atmospheric methane ($\text{CH}_4$), water ice/vapour ($\text{H}_2\text{O}$), and carbon dioxide ($\text{CO}_2$).
   - Distant solar system bodies shine by reflected solar light ($\propto \lambda^{-4}$ modified by surface ice albedos) and low-temperature thermal re-emission.

### 1.3 The Technical Hurdle: Spectrophotometric False Positives
In a linear variable filter (LVF) survey, **each sequential exposure is observed at a different central wavelength**. A traditional time-series blink across raw frames causes static astronomical objects to flicker wildly due to their intrinsic spectral slopes and molecular absorption bands, mimicking transient or variable behavior.

Furthermore, single-frame artifacts (radiation hits, detector snowballs, hot pixels, latent images, and optical reflections) generate false point-source detections. Rendezvous was engineered specifically to solve these challenges through chromatic SED normalization, pipeline flag bitmask propagation, sub-pixel PSF morphology tests, and multi-epoch vector linearity cross-matching.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDEZVOUS WEB OBSERVATORY                      │
├──────────────────────────┬─────────────────────────────────────────────┤
│   CLIENT-SIDE INGEST     │ - Bundled L2 Packs (Zlib / Asinh-companded) │
│                          │ - Drag-and-Drop FITS Engine (TAN-SIP WCS)   │
│                          │ - HiPS Multi-Mission Progressive Tiler      │
├──────────────────────────┼─────────────────────────────────────────────┤
│   REDUCTION PIPELINE     │ - Reprojection: North-Up Gnomonic Tangent   │
│                          │ - Outlier & Flag Cleaning: 22-bit Bitmasks  │
│                          │ - Inverse-Variance Weighted Epoch Co-Adding │
│                          │ - Temporal Difference Pairing: Lobe Search │
├──────────────────────────┼─────────────────────────────────────────────┤
│   ASTRONOMICAL BENCH     │ - Sub-Pixel Photometry (5x5 supersampling)  │
│                          │ - Merline & Howell (1995) Error Propagation │
│                          │ - King/Lindegren Sub-Pixel Centroiding      │
│                          │ - Linear Astrometric Solver (mu, PA, chi2)  │
│                          │ - Kinematic Regimes: Reflex vs. Kepler vs vt│
│                          │ - Planck Blackbody (150-12000K) + Power Law │
│                          │ - Molecular Indices: H2O, CH4, CO2, CO      │
│                          │ - Generalized Lomb-Scargle & Phase Folding  │
├──────────────────────────┼─────────────────────────────────────────────┤
│   DISCOVERY & EXPORT     │ - IEEE-754 32-bit Float FITS Exporter       │
│                          │ - In-Site Markdown Discovery Notebook       │
│                          │ - Photometric & Astrometric CSV Generators  │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### 2.1 Zero-Backend Scientific Engine
All numerical processing executes client-side within the browser:
- Built in **TypeScript / React 19** with zero server-side compute dependency.
- Image reprojection and numerical arrays leverage **Float32Array and Float64Array TypedArrays** for real-time mathematical operations.
- Offline-first execution: all bundled mission fields run with zero network access required.

### 2.2 Dual User Interfaces: Guided vs. Research Mode
- **Guided Mode**: Provides plain-language explanations, contextual step-by-step checklists, automatic candidate callouts, and intuitive visual cues designed for students and citizen scientists.
- **Research Mode**: Surfaces full mathematical equations, covariance error matrices, degrees of freedom, $\chi^2_\nu$ goodness-of-fit statistics, bitmask toggles, and manual tuning parameters for professional astrophysicists.
- **Command Palette (`⌘K` / `Ctrl-K`)**: Instant keyboard-driven navigation across every instrument command, calculation, target jump, and export function.

### 2.3 Obstruction-Free Main Spectrum Frame
To ensure maximum scientific fidelity, **the main spectrum viewport is kept 100% clean of obscuring text boxes**:
- **External Top Header Bar**: Houses target identity, pipeline origin (`SPHEREx L2`, etc.), operation state (`Co-add`, `Difference`, `Single exposure`), and detector band indicators (`[D1 D2 D3 · 0.750 µm]`).
- **External Bottom Frame Bar**: Houses sequence index (`Frame 1 / 4`, `Epoch 1 of 4`), observation date (`2024 May 14`), frame duration, and exact Modified Julian Date (`MJD`).
- **Canvas Interior**: Displays exclusively calibrated celestial pixels, astronomical vector overlays (reticle, Gaia DR3 circles, CatWISE2020 diamonds, moving-object dipole tags, and measurement rulers), and a low-opacity, transparent celestial orientation rose ($N/E$) and scale bar.

---

## 3. Scientific Instrumentation & Mathematical Formulations

### 3.1 Blink Comparator & Moving-Object Dipole Engine
When blinking between two epochs $e_A$ and $e_B$, Rendezvous generates a calibrated difference plane:
$$\Delta I_{ij} = I_{ij}(e_A) - I_{ij}(e_B)$$

Static stars and background galaxies subtract to zero (represented as the median grey background). A genuine moving object leaves a characteristic **dipole**:
- A **positive lobe** at the position occupied during visit $e_A$.
- A **negative lobe** at the position occupied during visit $e_B$.

```
Epoch A (earlier)        Epoch B (later)          Difference (A - B)
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │      (+)        │
│   ● (Object)    │  →   │                 │  =   │    (Bright)     │
│                 │      │    ● (Object)   │      │                 │
│        ★ (Star) │      │        ★ (Star) │      │      (-)  (Star │
└─────────────────┘      └─────────────────┘      │     (Dark) cancels)
                                                  └─────────────────┘
                                                        Dipole!
```

#### Automated Sub-Pixel Dipole Pairing Algorithm:
1. **Lobe Centroiding**: Computes flux-weighted sub-pixel centroids $(x_+, y_+)$ and $(x_-, y_-)$ on local extrema exceeding detection threshold ($S/N \ge 5\sigma$).
2. **Flux Symmetry Check**: True moving point sources produce approximately symmetric lobes. Candidates with flux ratios $|F_+ / F_-| > 4.5$ are rejected, eliminating false positives caused by stationary variable stars situated near background noise spikes.
3. **Multi-Visit Linearity Verification**: For fields spanning $\ge 3$ visits, Rendezvous performs linear trajectory interpolation across intermediate visits ($e_m$). A candidate is confirmed only if intermediate visits detect consistent flux along the vector path:
   $$\vec{x}(t_m) = \vec{x}(t_A) + \frac{t_m - t_A}{t_B - t_A} \left(\vec{x}(t_B) - \vec{x}(t_A)\right)$$
4. **Catalogue Proper-Motion Propagation**: Cross-matches candidates against **Gaia DR3** ($J2016.0$) and **CatWISE2020** ($MJD\ 57170 = 2015.4$). Catalog positions are propagated with their catalog proper-motion vectors to the exact observation epoch of the frame, preventing known high-proper-motion stars from being misidentified as new Solar System objects.

---

### 3.2 Multi-Epoch Astrometry & Kinematic Distance Classification

#### Iterative Gaussian-Windowed Sub-Pixel Centroiding
For each epoch shot $s$, source positions are extracted using an iterative Gaussian-windowed centroid:
$$x^{(k+1)} = \frac{\sum_{ij} w_{ij} (I_{ij} - I_{\text{sky}}) \, i}{\sum_{ij} w_{ij} (I_{ij} - I_{\text{sky}})}, \quad y^{(k+1)} = \frac{\sum_{ij} w_{ij} (I_{ij} - I_{\text{sky}}) \, j}{\sum_{ij} w_{ij} (I_{ij} - I_{\text{sky}})}$$
where $w_{ij} = \exp\left(-\frac{(i - x^{(k)})^2 + (j - y^{(k)})^2}{2 \sigma_w^2}\right)$ with window scale $\sigma_w = 1.15\text{ pixels}$.

#### Astrometric Uncertainty (King / Lindegren Formulation)
Astrometric 1D positional uncertainties incorporate photon noise and instrumental systematic error floors:
$$\sigma_{\text{pos}} = \sqrt{\left(\frac{\text{FWHM}}{2.3548 \cdot (S/N)}\right)^2 + \sigma_{\text{sys}}^2}$$
where $\text{FWHM}$ is the local point-spread function full-width at half-maximum ($7.5''\text{--}9.0''$), $2.3548$ converts FWHM to standard deviation, and $\sigma_{\text{sys}}$ is the systematic calibration floor ($0.22''$ for clean SPHEREx L2 frames, $0.65''$ for saturated/flagged cores).

#### Weighted Linear Proper-Motion Solver
Given centroids $(\alpha_k, \delta_k)$ at observation times $t_k$, Rendezvous transforms coordinates to local tangent offsets $(E_k, N_k)$ in arcseconds and solves the weighted least-squares linear system:
$$E(t) = E_0 + \mu_E (t - t_{\text{ref}}), \quad N(t) = N_0 + \mu_N (t - t_{\text{ref}})$$
with weights $w_k = 1 / \sigma_{\text{pos}, k}^2$. Total proper motion $\mu$, position angle $\text{PA}$, and goodness-of-fit $\chi^2_\nu$ are computed:
$$\mu = \sqrt{\mu_E^2 + \mu_N^2}, \quad \text{PA} = \left(\text{atan2}(\mu_E, \mu_N) \times \frac{180}{\pi} + 360\right) \pmod{360}$$
$$\chi^2_\nu = \frac{1}{2N - 4} \sum_{k=1}^N \left[\left(\frac{E_k - E(t_k)}{\sigma_k}\right)^2 + \left(\frac{N_k - N(t_k)}{\sigma_k}\right)^2\right]$$

#### Kinematic Regime Discriminator (Solar System vs. Galactic)
The proper motion rate $\mu$ and temporal baseline $\Delta t$ evaluate two competing physical hypotheses:

1. **Bound Solar System / Planet X Hypothesis**:
   - **Parallactic Reflex Motion**: Over a 6-month SPHEREx baseline ($\Delta t \approx 0.5\text{ yr}$), Earth's $2\text{ AU}$ orbital displacement projects a parallactic reflex oscillation onto an object at heliocentric distance $d$ (AU) and ecliptic latitude $\beta$:
     $$\Delta\theta_{\text{reflex}} \approx \frac{2\text{ AU} \cdot \cos\beta}{d} \times 206265'' \implies d_{\text{reflex}} = \frac{412530'' \cdot \cos\beta}{\mu \cdot \Delta t}$$
   - **Keplerian Orbital Motion**: For a circular orbit around the Sun, the secular prograde angular speed is:
     $$\omega_{\text{Kep}} = \frac{360^\circ}{r^{3/2}}\text{ yr}^{-1} = \frac{1,296,000''/\text{yr}}{r^{3/2}} \implies r_{\text{Kepler}} = \left(\frac{1,296,000}{\mu}\right)^{2/3}\text{ AU}$$
   - **Equilibrium Temperature**: Radiative balance under solar insolation ($A \approx 0.3$ Bond albedo):
     $$T_{\text{eq}} \approx 278 \cdot r_{\text{AU}}^{-1/2}\text{ K}$$
2. **Galactic Stellar / Brown Dwarf Hypothesis**:
   - Proper motion reflects tangential space velocity through the Milky Way:
     $$v_t = 4.74047 \cdot \mu[''/\text{yr}] \cdot d[\text{pc}] \quad (\text{km s}^{-1})$$
   - Where catalog parallax $\varpi$ is available, $d = 1000/\varpi\text{ pc}$ and $v_t$ are exact. For uncatalogued candidates, Rendezvous brackets kinematic distances across Galactic thin-disk ($v_t \approx 30\text{ km/s}$) and halo ($v_t \approx 150\text{ km/s}$) populations:
     $$d_{\text{thin}} = \frac{30}{4.74047 \cdot \mu}\text{ pc}, \quad d_{\text{halo}} = \frac{150}{4.74047 \cdot \mu}\text{ pc}$$

#### Radial Surface-Brightness Profile & Morphology Classification
To prevent false alarms from extended galaxies, nebulae, or single-pixel cosmic ray hits, Rendezvous evaluates azimuthally averaged surface brightness $I(r)$ in concentric $0.5''$ annuli out to $18''$:
- Compares measured profile against the analytical instrument PSF.
- Computes second-moment tensor components $(M_{xx}, M_{yy}, M_{xy})$ to calculate ellipticity:
  $$e = \frac{\sqrt{(M_{xx} - M_{yy})^2 + 4 M_{xy}^2}}{M_{xx} + M_{yy}}$$
- Issues an automated verdict: `Unresolved point source`, `Sub-PSF spike` (cosmic ray or hot pixel), or `Extended source` (galaxy or cometary coma).

---

### 3.3 Radiometric Calibration, Sub-Pixel Photometry & Error Propagation

#### Surface Brightness to Flux Density Calibration
SPHEREx Level-2 images are distributed in units of surface brightness: $\text{MJy sr}^{-1}$.  
A pixel of side $s = 6.15''$ subtends solid angle:
$$\Omega_{\text{pix}} = \left(\frac{s}{206264.806}\right)^2 = \left(\frac{6.15}{206264.806}\right)^2 = 8.8886 \times 10^{-10}\text{ sr}$$
Converting surface brightness in $\text{MJy sr}^{-1}$ to integrated flux density in millijanskys ($\text{mJy}$):
$$F_{\text{mJy}} = I_{\text{MJy/sr}} \times \Omega_{\text{pix}} \times 10^9 = I_{\text{MJy/sr}} \times 0.88886\text{ mJy per (MJy sr}^{-1}\text{)}$$

#### 5×5 Sub-Pixel Aperture Integration
To eliminate discrete discretization jumps as aperture radii or source centers vary, boundary pixels are supersampled onto a $5 \times 5$ sub-grid. Each pixel $(i, j)$ receives a continuous geometric weight $w_{ij} \in [0, 1]$ equal to the fraction of sub-pixels falling inside the circular aperture radius $R_{\text{ap}}$.

#### Gaussian PSF Encircled-Energy Chromatic Correction
Because diffraction causes the SPHEREx beam to scale linearly with wavelength ($\text{FWHM} \approx 7.5''$ at $0.75\,\mu\text{m}$ in D1, broadening to $\approx 9.0''$ at $5.0\,\mu\text{m}$ in D6), fixed aperture radii capture a wavelength-dependent fraction of point-source flux. Rendezvous corrects this chromatic loss using the exact 2D Gaussian encircled-energy integral:
$$\text{EE}(R) = \frac{\int_0^R I_0 e^{-r^2 / 2\sigma^2} 2\pi r \, dr}{\int_0^\infty I_0 e^{-r^2 / 2\sigma^2} 2\pi r \, dr} = 1 - e^{-R^2 / 2\sigma^2} = 1 - 2^{-4 (R / \text{FWHM})^2}$$
Total point-source flux density is restored by dividing raw aperture sums by $\text{EE}(R_{\text{ap}})$.

#### Background Annulus & Merline & Howell (1995) Error Propagation
Local background sky surface brightness $I_{\text{sky}}$ and its dispersion $\sigma_{\text{sky}}$ are estimated in a concentric background annulus ($R_{\text{in}} = 25''$, $R_{\text{out}} = 40''$) using the sample median and Median Absolute Deviation ($\text{MAD}$):
$$\sigma_{\text{sky}} = 1.4826 \times \text{median}\left(|I_{ij} - I_{\text{sky}}|\right)$$
Propagating aperture weights $w_{ij}$ and sky-estimation uncertainty with the Merline & Howell (1995) formulation:
$$\sigma_F = \frac{\Omega_{\text{pix}}}{\text{EE}(R_{\text{ap}})} \sqrt{\sum_{ij} w_{ij}^2 \sigma_{\text{pix}}^2 + \frac{\pi}{2} \frac{\left(\sum_{ij} w_{ij}\right)^2}{N_{\text{ann}}} \sigma_{\text{sky}}^2}$$
where the factor $\frac{\pi}{2} \approx 1.5708$ accounts for the asymptotic variance of the sample median estimator.

#### Monochromatic AB Magnitudes & 5σ Point-Source Sensitivity Limits
Flux densities in $\text{mJy}$ convert to the standard Oke & Gunn (1983) absolute AB magnitude scale ($3631\text{ Jy}$ zero point):
$$m_{\text{AB}} = -2.5 \log_{10}\left(\frac{F_\nu}{3631\text{ Jy}}\right) = -2.5 \log_{10}\left(\frac{F_{\text{mJy}} \times 10^{-3}\text{ Jy}}{3631\text{ Jy}}\right) = 16.4000656 - 2.5 \log_{10}(F_{\text{mJy}})$$
Formal $5\sigma$ point-source sensitivity limits are computed per visit:
$$F_{5\sigma} = \frac{5 \cdot \sigma_{\text{visit}} \cdot \sqrt{\pi R_{\text{ap}}^2 \cdot 1.18} \cdot \Omega_{\text{pix}}}{\text{EE}(R_{\text{ap}})}, \quad m_{5\sigma} = 16.4000656 - 2.5 \log_{10}(F_{5\sigma})$$

---

### 3.4 Spectrophotometric Modeling & Molecular Chemistry

```
   102-Channel SPHEREx Spectral Energy Distribution
   Flux (mJy)
     │
     │      ★ Continuum Blackbody Fit (Planck)
     │     / \
     │    /   \     H2O       H2O       H2O/Ice     CH4        CO2     CO
     │   /     \   (1.4µm)   (1.9µm)    (2.8µm)   (3.3µm)    (4.3µm) (4.7µm)
     │  /       \    ▼         ▼          ▼         ▼          ▼       ▼
     │ /         \  ╭╮        ╭╮         ╭─╮       ╭╮         ╭╮      ╭╮
     └─┴──────────┴─┴┴────────┴┴─────────┴─┴───────┴┴─────────┴┴──────┴┴───►
      0.75µm (D1)                  Wavelength (µm)               5.0µm (D6)
```

#### Weighted Planck Blackbody SED Fitting
Rendezvous models thermal emission across effective temperatures $150\text{ K} \le T_{\text{eff}} \le 12,000\text{ K}$.  
Planck spectral radiance per unit frequency $B_\nu(\lambda, T)$ in $\text{mJy sr}^{-1}$:
$$B_\nu(\lambda, T) = \frac{2 h c}{\lambda^3 \left(e^{h c / \lambda k T} - 1\right)} \times 10^{29} \quad (\text{mJy sr}^{-1})$$
where exact CODATA 2018 constants are used ($2hc = 3.9728917 \times 10^{-25}\text{ J m}$, $hc/k = 0.014387769\text{ m K}$).

Given observed spectrophotometric points $(F_k, \sigma_k, \lambda_k)$, the solid angle $\Omega_{\text{disk}}$ is solved analytically by linear profile $\chi^2$ minimization:
$$\Omega_{\text{disk}}(T) = \frac{\sum_k w_k F_k B_\nu(\lambda_k, T)}{\sum_k w_k B_\nu(\lambda_k, T)^2}, \quad w_k = \frac{1}{\sigma_k^2 + (0.03 F_k)^2}$$
Golden-section minimization refines optimal $T_{\text{eff}}$. Temperature uncertainties $\sigma_T$ are derived from numerical second derivatives of the curvature profile:
$$\sigma_T = \sqrt{\frac{2 \max(1, \chi^2_\nu)}{\partial^2 \chi^2 / \partial T^2}}$$
From $\Omega_{\text{disk}}$ and $T_{\text{eff}}$, Rendezvous calculates:
- **Photometric Angular Diameter**: $\theta_d = 2 \sqrt{\frac{\Omega_{\text{disk}}}{\pi}} \times 206265000\text{ mas}$
- **Bolometric Flux**: $F_{\text{bol}} = \frac{\Omega_{\text{disk}} \sigma_{\text{SB}} T_{\text{eff}}^4}{\pi}\text{ W m}^{-2}$ (where $\sigma_{\text{SB}} = 5.6703744 \times 10^{-8}\text{ W m}^{-2}\text{ K}^{-4}$)

#### Power-Law Continuum Slope
Fits $F_\nu(\lambda) = F_1 \cdot \lambda^\alpha$ with $4\sigma$ MAD outlier rejection. Rayleigh-Jeans stellar photospheres yield $\alpha \approx -2$, while cold brown dwarfs and dusty circumstellar disks exhibit steeply rising positive spectral indices ($\alpha > +2$).

#### Molecular Absorption Diagnostics
Rendezvous establishes clean blue and red continuum sidebands bracketing six key diagnostic infrared absorption features:
- $\text{H}_2\text{O}$ vapour: $1.40\,\mu\text{m}$ ($1.34\text{--}1.48\,\mu\text{m}$) and $1.88\,\mu\text{m}$ ($1.80\text{--}1.98\,\mu\text{m}$)
- $\text{H}_2\text{O}$ water ice / hydration: $2.80\,\mu\text{m}$ ($2.62\text{--}3.05\,\mu\text{m}$)
- $\text{CH}_4$ methane: $3.32\,\mu\text{m}$ ($3.18\text{--}3.48\,\mu\text{m}$)
- $\text{CO}_2$ carbon dioxide: $4.27\,\mu\text{m}$ ($4.20\text{--}4.35\,\mu\text{m}$)
- $\text{CO}$ carbon monoxide: $4.67\,\mu\text{m}$ ($4.52\text{--}4.80\,\mu\text{m}$)

For each band, Rendezvous linearly interpolates continuum flux $F_{\text{cont}}(\lambda)$ from sidebands and calculates:
$$\text{Fractional Depth}: D_b = 1 - \frac{F_{\text{band}}}{F_{\text{cont}}}, \quad \text{Equivalent Width}: W_\lambda = D_b \cdot \Delta\lambda_{\text{band}}\text{ (nm)}, \quad \text{Significance}: \frac{D_b}{\sigma_{D_b}}$$

---

### 3.5 Time-Series Variability & Generalized Lomb–Scargle Periodogram

#### Narrow-Channel Relative Normalization
To prevent static SED slopes and molecular bands from generating spurious periodogram signals, each exposure $F_i$ at wavelength $\lambda_i$ in detector array $d$ is normalized by its narrow-channel median:
$$y_i = \frac{F_i}{\text{median}_{\Delta\lambda}(F)}, \quad \sigma_{y, i} = \sqrt{\left(\frac{\sigma_{F, i}}{\text{median}(F)}\right)^2 + 0.025^2}$$

#### Constant-Flux Null-Hypothesis Test ($\chi^2_\nu$) and Excess Variance ($F_{\text{var}}$)
Evaluates whether relative time-series fluxes $y_i$ are consistent with a constant source:
$$\chi^2_\nu = \frac{1}{N - 1} \sum_{i=1}^N \left(\frac{y_i - \bar{y}_w}{\sigma_{y, i}}\right)^2, \quad \bar{y}_w = \frac{\sum w_i y_i}{\sum w_i}$$
Intrinsic fractional excess RMS variance is computed following Vaughan et al. (2003):
$$F_{\text{var}} = \frac{\sqrt{S^2 - \overline{\sigma_{\text{err}}^2}}}{\bar{y}}, \quad S^2 = \frac{1}{N - 1} \sum_{i=1}^N (y_i - \bar{y})^2, \quad \overline{\sigma_{\text{err}}^2} = \frac{1}{N} \sum_{i=1}^N \sigma_{y, i}^2$$
Sources with $\chi^2_\nu > 3.0$ and $F_{\text{var}} > 2.5\,\sigma_{F_{\text{var}}}$ are classified as **statistically variable**.

#### Generalized Lomb–Scargle (GLS) Floating-Mean Periodogram
Implements Zechmeister & Kürster (2009) floating-mean periodogram $P(\omega) \in [0, 1]$, which fits a harmonic function plus an arbitrary constant offset:
$$y(t) = c_0 + c_1 \cos(\omega t) + c_2 \sin(\omega t)$$
Using normalized weights $w_i = \frac{1 / \sigma_i^2}{\sum 1 / \sigma_k^2}$ and mean-subtracted vectors $\hat{y}_i = y_i - \bar{y}_w$:
$$C = \sum w_i \cos(\omega t_i), \quad S = \sum w_i \sin(\omega t_i)$$
$$\hat{CC} = \sum w_i \cos^2(\omega t_i) - C^2, \quad \hat{SS} = \sum w_i \sin^2(\omega t_i) - S^2, \quad \hat{CS} = \sum w_i \cos(\omega t_i) \sin(\omega t_i) - C S$$
$$D = \hat{CC} \cdot \hat{SS} - \hat{CS}^2$$
$$P(\omega) = \frac{\hat{SS} \cdot Y_C^2 + \hat{CC} \cdot Y_S^2 - 2 \hat{CS} \cdot Y_C Y_S}{Y Y \cdot D}$$
where $Y_C = \sum w_i \hat{y}_i \cos(\omega t_i)$, $Y_S = \sum w_i \hat{y}_i \sin(\omega t_i)$, and $YY = \sum w_i \hat{y}_i^2$.

#### Analytical False-Alarm Probability (FAP) Threshold
The probability that Gaussian noise produces a peak power exceeding $P_{\text{max}}$ over $M_{\text{eff}} \approx \Delta t \cdot \Delta f$ independent frequencies is evaluated analytically:
$$\text{FAP} = 1 - \left(1 - (1 - P_{\text{max}})^{(N - 3)/2}\right)^{M_{\text{eff}}}$$
The analytical 1% FAP significance threshold ($\alpha = 0.01$) is dynamically plotted as a red dashed line across all periodograms. Clicking any significant periodogram peak automatically phase-folds the multi-epoch light curve over two full cycles ($\phi \in [0, 2]$).

---

### 3.6 Field Colour–Magnitude Diagram (CMD)
Rendezvous constructs an interactive colour-magnitude diagram matching Gaia DR3 $G$-band optical photometry against CatWISE2020 $W1$ ($3.4\,\mu\text{m}$) infrared photometry:
- CatWISE2020 sources are cross-matched within $8''$ after propagating Gaia astrometry to epoch 2015.4.
- **Red-Excess Selection ($G - W1 > 4.0\text{ mag}$)**: Sources exhibiting severe optical-to-infrared deficits are highlighted in amber. This selection cleanly segregates ultra-cool T/Y brown dwarfs, heavily reddened young stellar objects (YSOs), and outer solar system bodies from ordinary stellar populations.

---

### 3.7 In-Browser FITS Workbench & WCS Engine
- **FITS Header & Data Parsing**: Fully decodes 8, 16, 32, -32 (IEEE float), and -64 bit primary HDUs and binary extensions (`IMAGE`, `VARIANCE`, `FLAGS`, `ZODI`, `WCS-WAVE`).
- **Gnomonic Tangent Projection (TAN-SIP)**: Accurately solves non-linear focal plane distortion using forward and reverse polynomial coefficients ($A_{p, q}$, $B_{p, q}$, $AP_{p, q}$, $BP_{p, q}$).
- **Standards-Compliant FITS Export**: Any displayed image plane (epoch co-add, difference dipole map, or survey stack) can be exported directly as a standards-compliant 32-bit IEEE float `.fits` file with standard FITS headers:
  ```
  SIMPLE  =                    T / file conforms to FITS standard
  BITPIX  =                  -32 / IEEE single precision floating point
  NAXIS   =                    2 / 2-dimensional image
  NAXIS1  =                   56 / width in pixels
  NAXIS2  =                   56 / height in pixels
  CTYPE1  = 'RA---TAN'           / Gnomonic projection
  CTYPE2  = 'DEC--TAN'           / Gnomonic projection
  RADESYS = 'ICRS    '           / International Celestial Reference System
  EQUINOX =               2000.0 / Julian equinox
  BUNIT   = 'MJy/sr  '           / Surface brightness
  ```

---

### 3.8 In-Site Discovery Notebook
Allows users and researchers to annotate and log verified candidates directly inside the session:
- Records RA, Dec (ICRS), epoch, S/N, proper motion vector ($\mu, \text{PA}$), $\chi^2_\nu$, estimated distance, and spectral notes.
- Persisted locally across browser sessions via `localStorage` (with sandbox fallback).
- Exportable at any moment as a GitHub Flavored Markdown document for inclusion in challenge submissions or astronomical circulars.

---

## 4. Bundled Mission Benchmark Fields

Rendezvous includes five pre-ingested, calibrated Level-2 SPHEREx mission fields that function **100% offline**:

| Target ID | Object Name | Astrophysical Class | Distance | Key Scientific Demonstration |
| :--- | :--- | :--- | :--- | :--- |
| `barnard` | **Barnard's Star** (GJ 699) | M4 V Red Dwarf | $5.96\text{ ly}$ | Fastest proper-motion star in the sky ($\mu = 10.39''/\text{yr}$). Classic positive/negative dipole demonstration; tests King/Lindegren sub-pixel centroiding across visits. |
| `epsindb` | **$\epsilon$ Indi Ba/Bb** | T1 + T6 Brown Dwarf Binary | $12.05\text{ ly}$ | Cold methane dwarf pair orbiting orange dwarf $\epsilon$ Ind A. Demonstrates $\text{CH}_4$ ($3.32\,\mu\text{m}$) and $\text{H}_2\text{O}$ ($1.88\,\mu\text{m}$) molecular band depth and equivalent width extraction. |
| `w0855` | **WISE 0855−0714** | Y4 Dwarf ($T \approx 250\text{ K}$) | $7.43\text{ ly}$ | Fourth nearest system to the Sun and the coldest known brown dwarf. Completely invisible below $4\,\mu\text{m}$; bright in SPHEREx D6 ($4.4\text{--}5.0\,\mu\text{m}$) at $S/N \approx 25$. Primary analog for Planet X thermal emission. |
| `rwaur` | **RW Aurigae** | Classical T Tauri Binary | $510\text{ ly}$ | Young star with circumstellar disk occultations. Tests normalized time-series photometry, fractional excess RMS ($F_{\text{var}}$), and irregular multi-magnitude fading. |
| `rdra` | **R Draconis** | Mira Pulsating Giant | $2,600\text{ ly}$ | Large-amplitude pulsating red giant near North Ecliptic Pole. Tests 22-bit saturation and overflow flag masking, long-baseline visit co-addition, and Generalized Lomb–Scargle 245-day period retrieval. |

---

## 5. 34-Year All-Sky Historical Survey Baseline

Beyond bundled fields, entering arbitrary sky coordinates switches Rendezvous to live HiPS mode, pulling real imagery across four major sky surveys to establish a **34-year proper-motion baseline**:

```
 1990s             1998–2001            2010                  2024–2025
┌──────────────┐  ┌────────────────┐   ┌──────────────────┐  ┌──────────────────┐
│ STScI DSS2   │  │ 2MASS          │   │ NASA AllWISE     │  │ NASA SPHEREx     │
│ Optical Red  │  │ Near-IR J/H/Ks │   │ Mid-IR W1/W2     │  │ 102-Band IR Cube │
│ (0.65 µm)    │  │ (1.25–2.17 µm) │   │ (3.4 & 4.6 µm)   │  │ (0.75–5.0 µm)    │
└──────┬───────┘  └───────┬────────┘   └────────┬─────────┘  └────────┬─────────┘
       │                  │                     │                     │
       └──────────────────┴─────────────────────┴─────────────────────┘
                          34-Year Baseline Astrometry Fit!
```

---

## 6. Installation & Development

### Prerequisites
- [Node.js](https://nodejs.org/) ($\ge 18.0$)
- `npm` ($\ge 9.0$)

### Local Setup
```bash
# Clone the repository
git clone https://github.com/evenstar1/rendezvous.git
cd rendezvous

# Install dependencies
npm install

# Start local development server with hot-module reload
npm run dev
```

### Production Build & Single-File Inlining
```bash
# Typecheck with TypeScript
npx tsc --noEmit

# Compile production bundle
npm run build
```
The output is compiled directly into `dist/index.html`. Using `vite-plugin-singlefile`, all JavaScript logic, stylesheets, fonts, and bundled Level-2 data packs are inlined into a single, fully portable, offline-executable HTML document.

---

## 6b. Live SPHEREx Mode (Any RA/Dec)

Rendezvous can fetch real SPHEREx Level-2 frames for any position, not just the five bundled fields:

1. Enter coordinates or a target name, then click **Load SPHEREx data (live)** (or open a URL with `?live=1`).
2. The app queries IRSA TAP (`spherex.obscore` / `spherex.artifact` + `spherex.plane`) for every Level-2 image whose footprint contains the position.
3. It requests a spatial cutout (`?center=ra,dec&size=...px`) for each frame, runs the same TAN-SIP reprojection, flag masking, zodiacal subtraction, co-add, difference, per-detector and photometry pipeline as the bundled fields.
4. Frames are capped at 48 (stratified by detector) to keep downloads bounded; progress and cancel are shown in the viewer.

Endpoints used:
- `https://irsa.ipac.caltech.edu/TAP/sync` (ADQL, CSV)
- `https://irsa.ipac.caltech.edu/SIA` (SIA2, VOTable)
- `https://irsa.ipac.caltech.edu/ibe/data/spherex/...fits?center=ra,dec&size=px`

Because IRSA does not send CORS headers, live mode uses a pass-through proxy (`netlify/functions/irsa-proxy.js`) that only forwards requests and adds CORS headers; it performs no processing and is gated by `VITE_USE_IRSA_PROXY` / `VITE_IRSA_PROXY_URL`.

Limits: coverage depends on the current IRSA SPHEREx release; positions with no frames return a plain-language "no coverage" message. New SPHEREx releases appear automatically—no rebuild is needed because queries run at view time.

---

## 7. Data Provenance & Mission Credits

Rendezvous uses exclusively authentic, calibrated astronomical data. All external links and API connections strictly credit the missions, surveys, and space agencies that gathered the observations:

- **NASA / JPL-Caltech / IPAC SPHEREx**: Level-2 spectral images, calibrated surface brightness cubes, and instrument transmission curves via the [NASA/IPAC Infrared Science Archive (IRSA)](https://irsa.ipac.caltech.edu/).
- **ESA / DPAC Gaia Mission**: Astrometric positions, proper motions, and parallaxes from [Gaia Data Release 3 (DR3)](https://www.cosmos.esa.int/web/gaia/dr3).
- **NASA / JPL WISE & CatWISE**: Mid-infrared photometry and catalog proper motions from the [CatWISE2020 catalog](https://catwise.github.io/) and AllWISE sky mosaics.
- **CDS Strasbourg**: HiPS hierarchical progressive survey tile access via Aladin / CDS servers, and astronomical name resolution via SIMBAD.
- **Two Micron All Sky Survey (2MASS)**: Near-infrared $J$, $H$, and $K_s$ survey mosaics.
- **Space Telescope Science Institute (STScI)**: Digitized Sky Survey (DSS2) photographic plate scans.
- **Imagery note**: The full-page background star field and the SPHEREx observatory image in the Instrument section are AI-generated illustrations used for presentation. They are not observational data; all scientific pixels, spectra, and measurements in Rendezvous come from the missions and archives listed above.

---

*Built with passion for the 2026 NASA Space Apps Challenge by Team Afterlight · Evenstar1.*
