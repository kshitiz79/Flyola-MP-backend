<?php

use App\Http\Controllers\Admin\AirportController;
use App\Http\Controllers\Admin\BlogController;
use App\Http\Controllers\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\FlightController;
use App\Http\Controllers\Admin\FlightScheduleController;
use App\Http\Controllers\Admin\PageController;
use App\Http\Controllers\Admin\ReportController;
use App\Http\Controllers\Admin\ReviewController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\TranjectionController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PhonePecontroller;
use App\Http\Controllers\User\UserDashboardController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/


Route::get('/', [HomeController::class, 'index'])->name('home');
Route::get('cache-clear', [HomeController::class, 'cacheClear'])->name('cache.clear');
Route::get('page/{slug}', [HomeController::class, 'page'])->name('page');
Route::get('about-us', [HomeController::class, 'about'])->name('about');
Route::get('blogs', [HomeController::class, 'blogs'])->name('blogs');
Route::get('blog/{slug}', [HomeController::class, 'blogDetails'])->name('blog.details');
Route::get('personal-charter', [HomeController::class, 'personalCharter'])->name('personal.charter');
Route::get('hire-charter', [HomeController::class, 'hireCharter'])->name('hire.charter');
Route::get('business-class-charter', [HomeController::class, 'businessClassCharter'])->name('business.class.charter');
Route::get('jet-hire', [HomeController::class, 'jetHire'])->name('jet.hire');
Route::get('helicopter-hire', [HomeController::class, 'helicopterHire'])->name('helicopter.hire');
Route::get('download-ticket', [HomeController::class, 'downloadTiket'])->name('download.ticket');
Route::get('contact-us', [HomeController::class, 'contactUs'])->name('contact.us');
Route::get('flight', [HomeController::class, 'flight'])->name('flight.find');
Route::get('schedules', [HomeController::class, 'scheduleList'])->name('schedule.list');
Route::post('booking/checkout', [BookingController::class, 'bookingCheckout'])->name('flight.booking.checkout');
Route::get('booking/{bookingNo}/checkout', [BookingController::class, 'bookingCheckoutPage'])->name('booking.checkout.payment');
Route::post('booking-ticket', [BookingController::class, 'bookTikat'])->name('booking.store');

Route::post('download-ticket', [HomeController::class, 'downloadTiketFind'])->name('download.ticket.find');
Route::get('terms-conditions', [HomeController::class, 'conditions'])->name('terms-conditions');
Route::get('privacy-policy', [HomeController::class, 'privacyPolicy'])->name('privacy.policy');
Route::get('refund-cancellation-policy', [HomeController::class, 'refundPolicy'])->name('refund.policy');
Route::get('request-a-quote', [HomeController::class, 'requestQuote'])->name('request.quote');
Route::post('contact', [HomeController::class, 'submitForm'])->name('contact.submit');
Route::get('date-wise-filter', [HomeController::class, 'dateWiseFilter'])->name('date.wise.filter');



Route::get('available-flight', [BookingController::class, 'findFlight'])->name('get.available.flight');
Route::get('encrypt-params', [BookingController::class, 'encryptParams'])->name('encrypt.params');
Route::get('confirm-ticket/{bookingId}', [BookingController::class, 'confirmTikat'])->name('confirm.tikat');
Route::get('print-ticket/{bookingpnr}', [BookingController::class, 'printTicket'])->name('printTicket');



//PAYMENT ROUTE

// PAY-U Route
Route::post('pay-u-response', [PaymentController::class, 'payUResponse'])->name('pay.u.response');
Route::post('pay-u-cancel', [PaymentController::class, 'payUCancel'])->name('pay.u.cancel');
//Razorpay Route
Route::post('razorpay-payment', [PaymentController::class, 'razorpayPayment'])->name('payment');
//PHONPE ROUTE
Route::get('pay-with-phonepe', [PhonePecontroller::class, 'payWithPhonePe'])->name('pay-with-phonepe');
Route::any('ticket', [PhonePecontroller::class, 'callback'])->name('phonepe-callback');
Route::get('phonepe-refund', [PhonePecontroller::class, 'refund'])->name('phonepe-refund');


// Route::get('user/login', [LoginController::class,'userLogin'])->name('user.login');
// Route::get('admin/login', [LoginController::class,'login']);




        Route::get('/', [UserDashboardController::class, 'index'])->name('user.dashboard');
        Route::get('booking-history', [UserDashboardController::class, 'bookingHistory'])->name('user.booking.list');
        Route::get('pnr-status', [UserDashboardController::class, 'pnrStatus'])->name('user.pnr.status');
        Route::get('refund-request', [UserDashboardController::class, 'refundRequest'])->name('user.refund.request');
        Route::get('payment', [UserDashboardController::class, 'paymentDetails'])->name('user.refund.payment');
        Route::get('support-ticket', [UserDashboardController::class, 'supportTicket'])->name('user.support.ticket');
        Route::get('billing-details', [UserDashboardController::class, 'bllingDetails'])->name('user.support.billing');
        Route::get('manage-profile', [UserDashboardController::class, 'manageProfile'])->name('user.manage.profile');
    });



    
    Route::middleware('auth', 'isAdmin')->prefix('admin/dashboard')->group(function () {
        Route::get('/', [DashboardController::class, 'index'])->name('admin.dashboard');
        Route::get('profile-update', [DashboardController::class, 'profileView'])->name('profile.update');
        Route::post('profile/update', [DashboardController::class, 'profileUpdate'])->name('profile.update.post');

        Route::get('bookings', [AdminBookingController::class, 'bookings'])->name('bookings');
        Route::get('bookings-list', [AdminBookingController::class, 'bookingsList'])->name('bookings.list');
        Route::get('bookings-detail/{pnr}', [AdminBookingController::class, 'bookingsDetail'])->name('bookings.detail');
        Route::post('bookings-update/{pnr}', [AdminBookingController::class, 'bookingsUpdate'])->name('bookings.update');
        Route::get('find-passenger', [AdminBookingController::class, 'findPassenger'])->name('find.passenger');
        Route::post('update-passenger', [AdminBookingController::class, 'updatePassenger'])->name('update.passenger');
        Route::post('add-passenger', [AdminBookingController::class, 'addPassenger'])->name('add.passenger');
        Route::post('delete-passenger', [AdminBookingController::class, 'deletePassenger'])->name('delete.passenger');
        Route::get('ticket-book', [AdminBookingController::class, 'ticketBook'])->name('offline.booking');

        // Route::get('available-booking', [AdminBookingController::class, 'availableBook'])->name('offline.booking.page');
        // Route::post('available-booking-store', [AdminBookingController::class, 'availableBookstore'])->name('offline.booking.store');
        Route::post('export-bookings', [AdminBookingController::class, 'generateReport'])->name('generate.report');
        Route::get('transaction-details', [TranjectionController::class, 'exportBookings'])->name('transaction');
        Route::get('transaction-list', [TranjectionController::class, 'ajexList'])->name('transaction.ajexList');
        Route::get('booking-report', [ReportController::class, 'booking'])->name('report.booking');
        Route::get('travel-report', [ReportController::class, 'travel'])->name('report.travel');
        Route::get('settings', [DashboardController::class, 'settings'])->name('settings');
        Route::post('settings-update', [DashboardController::class, 'settingsUpdate'])->name('settings.update');
        
        Route::get('flight-list', [FlightController::class, 'filter'])->name('flights.list');
        Route::post('flight-lists', [FlightController::class, 'flighList'])->name('flights');
        Route::post('flight-status', [FlightController::class, 'status'])->name('flight.status');
        
        Route::get('schedules-list', [FlightScheduleController::class, 'filter'])->name('schedules.list');
        Route::post('schedules-status', [FlightScheduleController::class, 'status'])->name('schedules.status');
        Route::post('schedule.find', [FlightScheduleController::class, 'scheduleFind'])->name('schedule.find');
        Route::get('reviews', [ReviewController::class, 'index'])->name('reviews.index');
        Route::get('reviews-update/{id}/{status}', [ReviewController::class, 'updateReview'])->name('reviews.update');

        // Route::get('flights', [FlightController::class, 'index'])->name('admin.flight');
        // Route::get('flight-schedules', [FlightScheduleController::class, 'index'])->name('admin.flight.schedule');

        

        Route::resources([
            'roles' => RoleController::class,
            'users' => UserController::class,
            'pages' => PageController::class,
            'blogs' => BlogController::class,
            'airports' => AirportController::class,
            'flights' => FlightController::class,
            'schedules' => FlightScheduleController::class,
            // 'reviews' => ReviewController::class,
        ]);

    });
});
